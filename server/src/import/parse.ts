import { airportTimeZone } from '@travel/shared/airports';
import type { Attachment, ReceivedEmail } from './resendInbound';

/**
 * Turning a forwarded confirmation into structured fields (PLAN.md §6.5).
 *
 * Heuristics run first and the LLM is the fallback, not the default. Most
 * airline and OTA mail is regular enough that a pattern finds the confirmation
 * code and flight number outright, and every email answered that way is one
 * that costs nothing, leaks nothing and cannot hallucinate.
 *
 * Nothing here is trusted. Whatever comes out lands as `needs_review` and a
 * human confirms before it becomes a real row (PLAN.md §4).
 */

export type Draft = {
  type: 'flight' | 'lodging' | 'activity';
  fields: Record<string, unknown>;
};

export type ParseResult =
  | { ok: true; draft: Draft; by: 'heuristic' | 'llm' }
  | { ok: false; by: 'none'; reason: string };

/** Strip tags so an HTML-only mail still yields text to match against. */
function plainText(email: ReceivedEmail): string {
  if (email.text.trim() !== '') return email.text;
  if (!email.html) return '';
  return email.html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

const CONFIRMATION =
  /\b(?:confirmation|booking|reservation|reference|record locator|PNR)\b[^A-Z0-9]{0,20}([A-Z0-9]{5,8})\b/i;
/** e.g. "TP 1233", "BA249", "U2 8501". Two letters or letter+digit, then 1–4 digits. */
const FLIGHT_NUMBER = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/;

/**
 * Airport codes are only believed when the table knows them **and** the word is
 * genuinely standalone. Three capitals appear all over ordinary prose ("VAT",
 * "PDF", "USD"), so an unchecked match would invent an itinerary.
 */
function airportCodes(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(/\b([A-Z]{3})\b/g)) {
    const code = m[1]!;
    if (airportTimeZone(code) && !seen.includes(code)) seen.push(code);
  }
  return seen;
}

export function parseHeuristic(email: ReceivedEmail): ParseResult | null {
  const text = plainText(email);
  if (text.trim() === '') return null;

  const confirmation = CONFIRMATION.exec(text)?.[1];
  const codes = airportCodes(text);
  const flight = FLIGHT_NUMBER.exec(text);

  /**
   * A flight is only claimed on two independent signals — a flight number *and*
   * two known airports. One alone is far too easy to hit by accident, and a
   * wrong guess here costs a human more time than no guess at all.
   */
  if (flight && codes.length >= 2) {
    return {
      ok: true,
      by: 'heuristic',
      draft: {
        type: 'flight',
        fields: {
          flightNumber: `${flight[1]}${flight[2]}`,
          departureAirport: codes[0],
          arrivalAirport: codes[1],
          ...(confirmation ? { confirmationCode: confirmation } : {}),
        },
      },
    };
  }

  // Everything else goes to the LLM: dates and times are where free-text mail
  // is genuinely irregular, and a half-built draft is worse than none.
  return null;
}

const SCHEMA_PROMPT = `You extract travel booking details from a forwarded confirmation email.

Return ONLY JSON matching this shape, with no prose and no markdown fence:

{
  "type": "flight" | "lodging" | "activity" | "unknown",
  "confirmationCode": string | null,
  "flight": { "airline": string, "flightNumber": string, "departureAirport": string,
              "departureLocal": "YYYY-MM-DDTHH:mm", "arrivalAirport": string,
              "arrivalLocal": "YYYY-MM-DDTHH:mm", "seat": string | null } | null,
  "lodging": { "name": string, "address": string | null,
               "checkInLocal": "YYYY-MM-DDTHH:mm", "checkOutLocal": "YYYY-MM-DDTHH:mm" } | null,
  "activity": { "kind": "restaurant"|"attraction"|"transport"|"other", "name": string,
                "location": string | null, "startLocal": "YYYY-MM-DDTHH:mm" } | null
}

Rules:
- Times are LOCAL wall-clock at the place they happen. Never convert to UTC and never add an offset.
- Airports are three-letter IATA codes.
- If a field is not stated in the email, use null. Do not infer, guess or invent.
- If the email is not a travel booking, return {"type":"unknown"} and nothing else.`;

/**
 * Gemini, on the paid tier (PLAN.md §6.7). The free tier may use prompts to
 * improve Google's products, and these prompts are booking confirmations —
 * names, home addresses, flight numbers, confirmation codes.
 */
export async function parseWithLlm(
  email: ReceivedEmail,
  apiKey: string,
  model: string,
  attachments: Attachment[] = [],
): Promise<ParseResult> {
  const text = plainText(email).slice(0, 20_000);

  /**
   * Attachments go to the model alongside the body.
   *
   * A forwarded airline confirmation is typically a covering note with the
   * actual ticket in a PDF, so the body alone yields a subject line and little
   * else. Gemini reads PDFs natively as inline data, which avoids taking on a
   * PDF-extraction dependency for what is otherwise a solved problem.
   *
   * They are held in memory and discarded with the request — nothing is written
   * to our database (PLAN.md §4). They are, however, sent to the model, which
   * is the same disclosure the email body already makes and the reason §6.7
   * puts this on the paid tier rather than the free one.
   */
  const parts: Record<string, unknown>[] = [
    { text: `${SCHEMA_PROMPT}\n\nSubject: ${email.subject}\n\n${text}` },
    ...attachments.map((a) => ({ inlineData: { mimeType: a.contentType, data: a.data } })),
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    },
  );

  if (!response.ok) {
    return { ok: false, by: 'none', reason: `Gemini returned ${response.status}` };
  }

  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return { ok: false, by: 'none', reason: 'Gemini returned no content' };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, by: 'none', reason: 'Gemini returned unparseable JSON' };
  }

  const type = parsed['type'];
  if (type !== 'flight' && type !== 'lodging' && type !== 'activity') {
    return { ok: false, by: 'none', reason: 'Not recognised as a travel booking' };
  }

  const detail = (parsed[type] ?? {}) as Record<string, unknown>;
  const confirmation = parsed['confirmationCode'];
  return {
    ok: true,
    by: 'llm',
    draft: {
      type,
      fields: {
        ...detail,
        ...(typeof confirmation === 'string' && confirmation !== ''
          ? { confirmationCode: confirmation }
          : {}),
      },
    },
  };
}

export async function parseBooking(
  email: ReceivedEmail,
  config: { apiKey: string | undefined; model: string },
  attachments: Attachment[] = [],
): Promise<ParseResult> {
  /**
   * Heuristics are skipped when there are attachments. They read only the body,
   * and on a forwarded ticket the body is a covering note — matching a stray
   * flight number there while the real itinerary sits unread in the PDF is
   * worse than going straight to the model.
   */
  if (attachments.length === 0) {
    const heuristic = parseHeuristic(email);
    if (heuristic) return heuristic;
  }

  /**
   * No key, or the call failed: the import still lands for review with nothing
   * extracted and the reason recorded. Parsing failure is never silent and
   * never drops the mail — the user gets a row saying "we received this,
   * couldn't read it, here is the source" (PLAN.md §6.7).
   */
  if (!config.apiKey) {
    return {
      ok: false,
      by: 'none',
      reason:
        attachments.length > 0
          ? 'The booking is in an attachment, which needs GEMINI_API_KEY to read'
          : 'No parser could read this email',
    };
  }

  try {
    return await parseWithLlm(email, config.apiKey, config.model, attachments);
  } catch (error) {
    return { ok: false, by: 'none', reason: `Parser failed: ${(error as Error).message}` };
  }
}
