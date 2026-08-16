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

/**
 * A flight number, but only where the email says it is one.
 *
 * The previous pattern matched `([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})` anywhere
 * in the text, which fires on a postal code, a table number, a tax line and a
 * street address. Requiring the word *flight* immediately before it is what
 * makes this a signal rather than a coincidence.
 *
 * Case-insensitive for the label only: the code itself must be upper case, and
 * that is checked after the match, because one regex cannot mix flags.
 */
const FLIGHT_NUMBER =
  /\b(?:flight|flt)\b[^A-Za-z0-9]{0,14}([A-Za-z]{2}|[A-Za-z]\d|\d[A-Za-z])\s?(\d{1,4})\b/i;

/** `YWG → YOW`, `YWG - YOW`, `YWG to YOW`. The order is the itinerary's. */
const ROUTE = /\b([A-Z]{3})\b\s*(?:→|-+>|–|—|-|\bto\b)\s*\b([A-Z]{3})\b/g;

/** `Departing Winnipeg (YWG)` … `Arriving Ottawa (YOW)`. */
const LABELLED_FROM = /\b(?:depart\w*|origin|from)\b[^()\n]{0,80}\(\s*([A-Z]{3})\s*\)/i;
const LABELLED_TO = /\b(?:arriv\w*|destination|to)\b[^()\n]{0,80}\(\s*([A-Z]{3})\s*\)/i;

/**
 * The departure and arrival airports, **as an ordered pair**.
 *
 * The previous version collected every three-letter word the airport table
 * recognised and took the first two in document order as the route. That is
 * wrong twice over.
 *
 * It is wrong about *what* is an airport: `ADD`, `SEE`, `EAT`, `ALL`, `THE`,
 * `FOR`, `AND`, `NOT`, `CAR`, `BUS`, `SAT`, `SUN` and `HST` are all live IATA
 * codes, so an OpenTable confirmation containing "ADD TO CALENDAR" and "SEE
 * MENU" produced a two-airport itinerary out of nothing — which is exactly how
 * a restaurant reservation arrived as a flight.
 *
 * And it is wrong about *which is which*: document order is not itinerary
 * order, so a code appearing in a footer, an advertisement or a fare rule ahead
 * of the real route became the departure airport.
 *
 * Both are fixed by only ever reading a route as a pair the email itself has
 * joined — with an arrow, a dash, the word "to", or departure/arrival labels. A
 * single loose code is never enough to place anyone anywhere.
 */
function flightRoute(text: string): { from: string; to: string } | null {
  const usable = (from: string, to: string) =>
    from !== to && airportTimeZone(from) !== undefined && airportTimeZone(to) !== undefined;

  for (const m of text.matchAll(ROUTE)) {
    const [from, to] = [m[1]!, m[2]!];
    if (usable(from, to)) return { from, to };
  }

  const from = LABELLED_FROM.exec(text)?.[1];
  const to = LABELLED_TO.exec(text)?.[1];
  if (from !== undefined && to !== undefined && usable(from, to)) return { from, to };

  return null;
}

export function parseHeuristic(email: ReceivedEmail): ParseResult | null {
  const text = plainText(email);
  if (text.trim() === '') return null;

  const confirmation = CONFIRMATION.exec(text)?.[1];
  const route = flightRoute(text);
  const flight = FLIGHT_NUMBER.exec(text);
  const carrier = flight?.[1];

  /**
   * A flight is only claimed on two independent signals — a flight number the
   * email labelled as one, *and* a route the email wrote as a route. One alone
   * is far too easy to hit by accident, and a wrong guess costs a human more
   * time than no guess at all.
   */
  if (flight && carrier !== undefined && carrier === carrier.toUpperCase() && route) {
    return {
      ok: true,
      by: 'heuristic',
      draft: {
        type: 'flight',
        fields: {
          flightNumber: `${carrier}${flight[2]}`,
          departureAirport: route.from,
          arrivalAirport: route.to,
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
                "location": string | null, "startLocal": "YYYY-MM-DDTHH:mm",
                "endLocal": "YYYY-MM-DDTHH:mm" | null } | null
}

Rules:
- Times are LOCAL wall-clock at the place they happen. Never convert to UTC and never add an offset.
- Airports are three-letter IATA codes.
- departureAirport is where the passenger boards and arrivalAirport is where they finally get off.
  Take both from the itinerary itself. Airports named in fare rules, baggage terms, advertisements,
  loyalty-programme text or the airline's own mailing address are not part of this booking.
- If the booking covers several flights, extract only the first one.
- If a field is not stated in the email, use null. Do not infer, guess or invent.
- A train, coach or ferry booking is an activity with kind "transport". Put the route in the name
  ("Via Rail 55, Ottawa to Toronto"), the origin in location, and the arrival time in endLocal —
  without it the arrival is lost entirely.
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
    /**
     * Include the model name and the API's own message. A bare status is
     * unactionable, and the two likely causes look identical without it: a 404
     * is almost always a model id that does not exist for this key, not a
     * missing endpoint, and the body says which.
     */
    const detail = await response.text().catch(() => '');
    const message = (() => {
      try {
        const parsedBody = JSON.parse(detail) as { error?: { message?: string } };
        return parsedBody.error?.message ?? detail;
      } catch {
        return detail;
      }
    })();
    return {
      ok: false,
      by: 'none',
      reason:
        `Gemini returned ${response.status} for model "${model}"` +
        (message ? `: ${message.slice(0, 300)}` : '') +
        (response.status === 404
          ? '. Set GEMINI_MODEL to a model your API key can use — list them with' +
            ' curl -s "https://generativelanguage.googleapis.com/v1beta/models" -H "x-goog-api-key: $KEY"'
          : ''),
    };
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
