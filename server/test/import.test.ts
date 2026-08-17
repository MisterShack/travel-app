import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { bookingImports } from '../src/db/schema';
import { parseHeuristic } from '../src/import/parse';
import { addressOf, type ReceivedEmail } from '../src/import/resendInbound';
import { verifyWebhook } from '../src/import/signature';
import { createHarness, jsonRequest, signUp, type Harness } from './helpers';

let h: Harness;
afterEach(() => h?.cleanup());

const SECRET = 'whsec_' + Buffer.from('a-test-signing-secret-32-bytes!!').toString('base64');
const NOW = new Date('2026-08-15T12:00:00.000Z');

function signed(body: unknown, at: Date = NOW, secret = SECRET) {
  const raw = JSON.stringify(body);
  const id = 'msg_test';
  const ts = String(Math.floor(at.getTime() / 1000));
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
  return new Request('http://localhost/api/webhooks/resend-inbound', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': `v1,${sig}`,
    },
    body: raw,
  });
}

const email = (over: Partial<ReceivedEmail> = {}): ReceivedEmail => ({
  id: 'em_1',
  from: 'David <a@example.com>',
  to: ['trips@mail.myze.ca'],
  subject: 'Your TAP booking',
  text: 'Confirmation: ABC123. Flight TP 1233 from LHR to LIS on 10 September.',
  html: null,
  createdAt: '2026-08-15T11:00:00.000Z',
  ...over,
});

const ENV = { RESEND_WEBHOOK_SECRET: SECRET, INBOUND_ADDRESS: 'trips@mail.myze.ca' };

describe('signature verification', () => {
  const headers = (over = {}) => ({ id: 'msg_1', timestamp: '1786888800', signature: 'v1,x', ...over });

  it('refuses everything when no secret is configured', () => {
    // An unsigned-but-accepted webhook is an unauthenticated endpoint that
    // fetches attacker-chosen messages and writes rows.
    expect(verifyWebhook(undefined, headers(), '{}').ok).toBe(false);
  });

  it('rejects a bad signature', () => {
    expect(verifyWebhook(SECRET, headers(), '{}', NOW).ok).toBe(false);
  });

  it('rejects a replayed request outside the tolerance window', () => {
    const raw = '{}';
    const ts = String(Math.floor(NOW.getTime() / 1000));
    const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
    const sig = createHmac('sha256', key).update(`msg_1.${ts}.${raw}`).digest('base64');
    const hours = new Date(NOW.getTime() + 6 * 60 * 60 * 1000);
    const result = verifyWebhook(SECRET, headers({ timestamp: ts, signature: `v1,${sig}` }), raw, hours);
    expect(result).toEqual({ ok: false, reason: 'stale' });
  });

  it('accepts a correctly signed request', () => {
    const raw = '{"hello":"world"}';
    const ts = String(Math.floor(NOW.getTime() / 1000));
    const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
    const sig = createHmac('sha256', key).update(`msg_1.${ts}.${raw}`).digest('base64');
    expect(verifyWebhook(SECRET, headers({ timestamp: ts, signature: `v1,${sig}` }), raw, NOW).ok).toBe(true);
  });
});

describe('the inbound webhook', () => {
  const setup = (messages: Record<string, ReceivedEmail>) => createHarness(ENV, messages);

  it('rejects an unsigned request', async () => {
    h = await setup({ em_1: email() });
    const res = await h.app.request(
      new Request('http://localhost/api/webhooks/resend-inbound', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: { email_id: 'em_1' } }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await h.db.select().from(bookingImports)).toHaveLength(0);
  });

  it('imports a signed message from a verified sender', async () => {
    h = await setup({ em_1: email() });
    await signUp(h, 'a@example.com');
    const res = await h.app.request(signed({ data: { email_id: 'em_1' } }));
    expect(res.status).toBe(200);

    const rows = await h.db.select().from(bookingImports);
    expect(rows).toHaveLength(1);
    // Never applied: a human confirms before anything reaches the timeline.
    expect(rows[0]?.status).toBe('needs_review');
    expect(rows[0]?.extractedType).toBe('segment');
    expect(rows[0]?.parsedBy).toBe('heuristic');
  });

  it('ignores mail sent to any other address on the domain', async () => {
    // An MX on the sending domain delivers replies to our own no-reply here.
    h = await setup({ em_1: email({ to: ['no-reply@mail.myze.ca'] }) });
    await signUp(h, 'a@example.com');
    await h.app.request(signed({ data: { email_id: 'em_1' } }));
    expect(await h.db.select().from(bookingImports)).toHaveLength(0);
  });

  it('ignores an unknown sender', async () => {
    h = await setup({ em_1: email({ from: 'stranger@elsewhere.com' }) });
    await signUp(h, 'a@example.com');
    await h.app.request(signed({ data: { email_id: 'em_1' } }));
    expect(await h.db.select().from(bookingImports)).toHaveLength(0);
  });

  it('is idempotent across provider retries', async () => {
    h = await setup({ em_1: email() });
    await signUp(h, 'a@example.com');
    await h.app.request(signed({ data: { email_id: 'em_1' } }));
    await h.app.request(signed({ data: { email_id: 'em_1' } }));
    expect(await h.db.select().from(bookingImports)).toHaveLength(1);
  });

  it('records a failure rather than dropping an unreadable email', async () => {
    // Parsing failure is never silent and never loses the mail.
    h = await setup({ em_1: email({ text: 'Hello, are we still on for lunch?', subject: 'lunch' }) });
    await signUp(h, 'a@example.com');
    await h.app.request(signed({ data: { email_id: 'em_1' } }));

    const rows = await h.db.select().from(bookingImports);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.errorMessage).toBeTruthy();
  });

  it('accepts any of several inbound addresses', async () => {
    /*
     * Renaming the app moved the import address from `trips@` to `waypoint@`,
     * and mail to the old one was discarded — correctly, but a forwarding rule
     * saved in someone's mail client does not update itself. Both work while a
     * rename settles.
     */
    h = await createHarness(
      { ...ENV, INBOUND_ADDRESS: 'waypoint@mail.myze.ca, trips@mail.myze.ca' },
      { em_1: email({ to: ['waypoint@mail.myze.ca'] }), em_2: email({ id: 'em_2' }) },
    );
    await signUp(h, 'a@example.com');

    await h.app.request(signed({ data: { email_id: 'em_1' } }));
    await h.app.request(signed({ data: { email_id: 'em_2' } }));
    expect(await h.db.select().from(bookingImports)).toHaveLength(2);
  });

  it('still discards mail sent anywhere else', async () => {
    // The gate exists because an MX on the sending domain makes every address
    // there deliver here, including the no-reply the app sends from.
    h = await setup({ em_1: email({ to: ['no-reply@mail.myze.ca'] }) });
    await signUp(h, 'a@example.com');
    await h.app.request(signed({ data: { email_id: 'em_1' } }));
    expect(await h.db.select().from(bookingImports)).toHaveLength(0);
  });

  it('pre-selects a trip only when there is exactly one candidate', async () => {
    h = await setup({ em_1: email(), em_2: email({ id: 'em_2' }) });
    const cookie = await signUp(h, 'a@example.com');
    const trip = { name: 'Lisbon', startDate: '2026-09-10', endDate: '2026-09-18', homeTimezone: 'Europe/Lisbon' };
    await h.app.request(jsonRequest('/trips', 'POST', trip, cookie));

    await h.app.request(signed({ data: { email_id: 'em_1' } }));
    expect((await h.db.select().from(bookingImports))[0]?.tripId).toBeTruthy();

    // A second upcoming trip makes it ambiguous, so it must ask rather than guess.
    await h.app.request(jsonRequest('/trips', 'POST', { ...trip, name: 'Porto' }, cookie));
    await h.app.request(signed({ data: { email_id: 'em_2' } }));
    const rows = await h.db.select().from(bookingImports).where(eq(bookingImports.resendMessageId, 'em_2'));
    expect(rows[0]?.tripId).toBeNull();
  });
});

describe('the review queue', () => {
  it('never shows one account another account\'s import', async () => {
    h = await createHarness(ENV, { em_1: email() });
    await signUp(h, 'a@example.com');
    const other = await signUp(h, 'b@example.com');
    await h.app.request(signed({ data: { email_id: 'em_1' } }));

    const res = await h.app.request(jsonRequest('/imports', 'GET', undefined, other));
    await expect(res.json()).resolves.toEqual({ imports: [] });
  });

  it('counts only what is still awaiting review', async () => {
    /*
     * The badge on the Inbox tab read "3 awaiting review" against one
     * outstanding import and never went down, because this route counted every
     * row the account had ever received while the list beside it filtered
     * `applied` and `rejected` out. Both now use one predicate, so the two
     * cannot drift apart again.
     */
    h = await createHarness(ENV, { em_1: email(), em_2: email({ id: 'em_2' }), em_3: email({ id: 'em_3' }) });
    const cookie = await signUp(h, 'a@example.com');
    for (const id of ['em_1', 'em_2', 'em_3']) {
      await h.app.request(signed({ data: { email_id: id } }));
    }

    const count = async () => {
      const res = await h.app.request(jsonRequest('/imports/count', 'GET', undefined, cookie));
      return ((await res.json()) as { count: number }).count;
    };
    const listed = async () => {
      const res = await h.app.request(jsonRequest('/imports', 'GET', undefined, cookie));
      return ((await res.json()) as { imports: unknown[] }).imports.length;
    };

    expect(await count()).toBe(3);

    const rows = await h.db.select().from(bookingImports);
    await h.app.request(jsonRequest(`/imports/${rows[0]!.id}/reject`, 'POST', undefined, cookie));
    await h.app.request(jsonRequest(`/imports/${rows[1]!.id}/apply`, 'POST', undefined, cookie));

    expect(await count()).toBe(1);
    expect(await listed()).toBe(1);
  });

  it('keeps a two-leg booking in the queue until both legs are added', async () => {
    /*
     * A return trip is one email and two flights. Filing the import when the
     * outbound was added would take the return with it — the email leaves the
     * queue and the flight home is simply never entered.
     */
    h = await createHarness(ENV, { em_1: email() });
    const cookie = await signUp(h, 'a@example.com');
    await h.app.request(signed({ data: { email_id: 'em_1' } }));

    const imp = (await h.db.select().from(bookingImports))[0]!;
    await h.db
      .update(bookingImports)
      .set({
        extractedType: 'segment',
        extractedFields: JSON.stringify({
          segments: [{ origin: 'YWG' }, { origin: 'YOW' }],
        }),
      })
      .where(eq(bookingImports.id, imp.id));

    const apply = async (segment: number) => {
      const res = await h.app.request(
        jsonRequest(`/imports/${imp.id}/apply`, 'POST', { segment }, cookie),
      );
      return ((await res.json()) as { remaining: number }).remaining;
    };

    expect(await apply(0)).toBe(1);
    expect((await h.db.select().from(bookingImports))[0]?.status).not.toBe('applied');

    // Adding the same leg twice must not count as finishing the booking.
    expect(await apply(0)).toBe(1);
    expect((await h.db.select().from(bookingImports))[0]?.status).not.toBe('applied');

    expect(await apply(1)).toBe(0);
    expect((await h.db.select().from(bookingImports))[0]?.status).toBe('applied');
  });

  it('files a single-leg import on the first apply, as before', async () => {
    h = await createHarness(ENV, { em_1: email() });
    const cookie = await signUp(h, 'a@example.com');
    await h.app.request(signed({ data: { email_id: 'em_1' } }));
    const imp = (await h.db.select().from(bookingImports))[0]!;

    await h.app.request(jsonRequest(`/imports/${imp.id}/apply`, 'POST', { segment: 0 }, cookie));
    expect((await h.db.select().from(bookingImports))[0]?.status).toBe('applied');
  });

  it('refuses to assign an import to a trip the caller is not in', async () => {
    h = await createHarness(ENV, { em_1: email() });
    const owner = await signUp(h, 'a@example.com');
    const stranger = await signUp(h, 'b@example.com');
    const trip = await h.app.request(
      jsonRequest('/trips', 'POST', { name: 'X', startDate: '2026-09-10', endDate: '2026-09-18', homeTimezone: 'UTC' }, stranger),
    );
    const { id: tripId } = (await trip.json()) as { id: string };
    await h.app.request(signed({ data: { email_id: 'em_1' } }));
    const imp = (await h.db.select().from(bookingImports))[0]!;

    const res = await h.app.request(jsonRequest(`/imports/${imp.id}/assign`, 'POST', { tripId }, owner));
    expect(res.status).toBe(404);
  });
});

describe('heuristics', () => {
  it('claims a flight only on two independent signals', () => {
    // A labelled flight number alone, or a route alone, is far too easy to hit
    // by accident — a wrong guess costs a human more than no guess.
    expect(parseHeuristic(email({ text: 'Flight TP 1233 confirmed.' }))).toBeNull();
    expect(parseHeuristic(email({ text: 'LHR to LIS next week.' }))).toBeNull();
    const both = parseHeuristic(email({ text: 'Flight TP 1233, LHR to LIS' }));
    expect(both?.ok).toBe(true);
  });

  it('requires the email to call the flight number a flight number', () => {
    // Unanchored, `([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})` matches a postal
    // code, a table number, a tax line and half of every street address.
    expect(parseHeuristic(email({ text: 'Table M5 12 at LHR to LIS Bistro' }))).toBeNull();
  });

  it('does not treat ordinary three-letter words as airports', () => {
    // "VAT" and "USD" are not airports; an unchecked match invents itineraries.
    expect(parseHeuristic(email({ text: 'Total inc VAT in USD was 250. Ref AB12345' }))).toBeNull();
  });

  it('does not turn a restaurant reservation into a flight', () => {
    /*
     * This is the one that shipped wrong. `ADD`, `SEE` and `EAT` are all live
     * IATA codes, so "ADD TO CALENDAR" and "SEE MENU" in an OpenTable
     * confirmation supplied two "airports", and a table number supplied the
     * "flight number". Nothing in this text is a flight, and the parser must
     * hand it to the model rather than guess.
     */
    const opentable = [
      'Your reservation is confirmed',
      'Cervejaria Ramiro, table for 4 at 8:30 PM',
      'ADD TO CALENDAR   SEE MENU   EAT LATER',
      'Confirmation ABC12345',
    ].join('\n');
    expect(parseHeuristic(email({ subject: 'Table for 4', text: opentable }))).toBeNull();
  });

  it('reads the route as a pair, not the first two codes in the document', () => {
    /*
     * Document order is not itinerary order. A code in a footer, an advert or a
     * fare rule used to become the departure airport — which is how a Winnipeg
     * to Ottawa flight was imported as departing Toronto.
     */
    const westjet = [
      'WestJet Rewards: earn dollars on every flight from YYZ.',
      'Flight WS 3120',
      'YWG - YOW',
      'Booking reference ABCDEF',
    ].join('\n');
    const parsed = parseHeuristic(email({ text: westjet }));
    expect(parsed?.ok).toBe(true);
    expect(parsed?.ok === true && parsed.draft.fields).toMatchObject({
      segments: [{ service: 'WS3120', origin: 'YWG', destination: 'YOW' }],
    });
  });

  it('reads a route written as departure and arrival labels', () => {
    const text = [
      'Flight WS 3120',
      'Departing Winnipeg (YWG) at 07:15',
      'Arriving Ottawa (YOW) at 10:40',
    ].join('\n');
    const parsed = parseHeuristic(email({ text }));
    expect(parsed?.ok === true && parsed.draft.fields).toMatchObject({
      segments: [{ origin: 'YWG', destination: 'YOW' }],
    });
  });

  it('reads an HTML-only email', () => {
    const html = '<p>Flight <b>TP 1233</b> from <span>LHR</span> to <span>LIS</span></p>';
    expect(parseHeuristic(email({ text: '', html }))?.ok).toBe(true);
  });
});

describe('addressOf', () => {
  it('extracts and normalises an address', () => {
    expect(addressOf('David <A@Example.COM>')).toBe('a@example.com');
    expect(addressOf('  b@example.com ')).toBe('b@example.com');
  });
});

describe('signing-secret formats', () => {
  const raw = '{"a":1}';
  const ts = String(Math.floor(NOW.getTime() / 1000));
  const sign = (keyBytes: Buffer) =>
    createHmac('sha256', keyBytes).update(`msg_1.${ts}.${raw}`).digest('base64');
  const hdrs = (sig: string) => ({ id: 'msg_1', timestamp: ts, signature: `v1,${sig}` });

  it('accepts a secret with the whsec_ prefix', () => {
    const b64 = Buffer.from('some-secret-bytes-here-32-chars!').toString('base64');
    expect(verifyWebhook(`whsec_${b64}`, hdrs(sign(Buffer.from(b64, 'base64'))), raw, NOW).ok).toBe(true);
  });

  it('accepts the same secret without the prefix', () => {
    // Resend's docs do not promise the prefix, so both forms must work.
    const b64 = Buffer.from('some-secret-bytes-here-32-chars!').toString('base64');
    expect(verifyWebhook(b64, hdrs(sign(Buffer.from(b64, 'base64'))), raw, NOW).ok).toBe(true);
  });

  it('tolerates quotes around a pasted secret', () => {
    // Pasting "whsec_…" into a dashboard variable fails identically to a wrong
    // secret, which is an expensive hour to spend.
    const b64 = Buffer.from('some-secret-bytes-here-32-chars!').toString('base64');
    expect(verifyWebhook(`"whsec_${b64}"`, hdrs(sign(Buffer.from(b64, 'base64'))), raw, NOW).ok).toBe(true);
  });

  it('treats a non-base64 secret as raw bytes rather than decoding to garbage', () => {
    const plain = 'not-base64-at-all!!';
    expect(verifyWebhook(plain, hdrs(sign(Buffer.from(plain, 'utf8'))), raw, NOW).ok).toBe(true);
  });
});

describe('attachments', () => {
  const pdf = { filename: 'ticket.pdf', contentType: 'application/pdf', data: 'JVBERi0x' };

  it('skips heuristics when there is an attachment', async () => {
    // A forwarded ticket's body is a covering note. Matching a stray flight
    // number there while the real itinerary sits unread in the PDF is worse
    // than going straight to the model.
    const { parseBooking } = await import('../src/import/parse');
    const withSignals = email({ text: 'Flight TP 1233, LHR to LIS' });

    // No key, so the LLM path cannot run — the result tells us which branch
    // was taken.
    const result = await parseBooking(withSignals, { apiKey: undefined, model: 'm' }, [pdf]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/attachment/);
  });

  it('still uses heuristics when there are none', async () => {
    const { parseBooking } = await import('../src/import/parse');
    const result = await parseBooking(email({ text: 'Flight TP 1233, LHR to LIS' }), {
      apiKey: undefined,
      model: 'm',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.by).toBe('heuristic');
  });

  it('imports an attachment-only email as reviewable rather than dropping it', async () => {
    // The real case: a covering note plus the ticket as a PDF, and no model
    // key configured. It must still land with the source reachable.
    h = await createHarness(ENV, { em_1: email({ text: 'Sent from my iPhone', subject: 'Fwd: Your itinerary' }) });
    await signUp(h, 'a@example.com');
    await h.app.request(signed({ data: { email_id: 'em_1' } }));

    const rows = await h.db.select().from(bookingImports);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.errorMessage).toBeTruthy();
  });
});

describe('GEMINI_MODEL', () => {
  it('strips a models/ prefix and surrounding whitespace', async () => {
    // The request path already adds `models/`. Including it produces a 404
    // indistinguishable from a model that does not exist.
    const { loadEnv } = await import('../src/env');
    expect(loadEnv({ GEMINI_MODEL: ' models/gemini-2.5-flash-lite ' } as NodeJS.ProcessEnv).GEMINI_MODEL).toBe(
      'gemini-2.5-flash-lite',
    );
  });

  it('defaults to an alias that cannot go stale', async () => {
    const { loadEnv } = await import('../src/env');
    expect(loadEnv({} as NodeJS.ProcessEnv).GEMINI_MODEL).toBe('gemini-flash-lite-latest');
  });
});

describe('the model path', () => {
  /** Gemini's wire shape, so the whole decode runs rather than a hand-made Draft. */
  const geminiReplying = (payload: unknown) =>
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

  afterEach(() => vi.unstubAllGlobals());

  it('reads a forwarded restaurant booking as a restaurant', async () => {
    /*
     * The email that started this: an OpenTable confirmation imported as a
     * flight, because "ADD TO CALENDAR" and "SEE MENU" supplied two IATA codes.
     * The heuristic now declines it, so this is the path it actually takes —
     * and `kind` has to survive the decode for the review form to prefill.
     */
    const opentable = email({
      subject: 'Your table at Cervejaria Ramiro is confirmed',
      text: [
        'Your reservation is confirmed',
        'Cervejaria Ramiro — table for 4',
        'Thursday, September 10 at 8:30 PM',
        'Av. Almirante Reis 1, Lisbon',
        'ADD TO CALENDAR   SEE MENU',
        'Confirmation ABC12345',
      ].join('\n'),
    });
    expect(parseHeuristic(opentable)).toBeNull();

    vi.stubGlobal(
      'fetch',
      geminiReplying({
        type: 'activity',
        confirmationCode: 'ABC12345',
        flight: null,
        lodging: null,
        activity: {
          kind: 'restaurant',
          name: 'Cervejaria Ramiro',
          location: 'Av. Almirante Reis 1, Lisbon',
          startLocal: '2026-09-10T20:30',
          endLocal: null,
        },
      }),
    );

    const { parseBooking } = await import('../src/import/parse');
    const result = await parseBooking(opentable, { apiKey: 'k', model: 'm' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.by).toBe('llm');
      expect(result.draft.type).toBe('activity');
      expect(result.draft.fields).toMatchObject({
        kind: 'restaurant',
        name: 'Cervejaria Ramiro',
        startLocal: '2026-09-10T20:30',
        confirmationCode: 'ABC12345',
      });
    }
  });

  it('reads a return trip as two flights, and everyone on it', async () => {
    /*
     * A round trip is one email and two timeline rows. The schema asked for a
     * single flight and the prompt told the model to take only the first, so
     * the return was extracted and then thrown away — and a family booking
     * came back with one seat and nobody's name.
     */
    vi.stubGlobal(
      'fetch',
      geminiReplying({
        type: 'segment',
        confirmationCode: 'ABCDEF',
        passengers: [
          { name: 'David Shack', seat: '14C' },
          { name: 'Sam Shack', seat: '14D' },
        ],
        segments: [
          {
            carrier: 'WestJet',
            service: 'WS3120',
            origin: 'YWG',
            departureLocal: '2026-09-10T07:15',
            destination: 'YOW',
            arrivalLocal: '2026-09-10T10:40',
          },
          {
            carrier: 'WestJet',
            service: 'WS3121',
            origin: 'YOW',
            departureLocal: '2026-09-14T18:00',
            destination: 'YWG',
            arrivalLocal: '2026-09-14T20:25',
          },
        ],
        lodging: null,
        activity: null,
      }),
    );

    const { parseBooking } = await import('../src/import/parse');
    const result = await parseBooking(email({ text: 'Your WestJet itinerary' }), {
      apiKey: 'k',
      model: 'm',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fields = result.draft.fields as {
      segments: { origin: string; destination: string }[];
      passengers: { name: string; seat: string }[];
    };
    expect(fields.segments).toHaveLength(2);
    expect(fields.segments.map((f) => `${f.origin}-${f.destination}`)).toEqual([
      'YWG-YOW',
      'YOW-YWG',
    ]);
    expect(fields.passengers).toEqual([
      { name: 'David Shack', seat: '14C' },
      { name: 'Sam Shack', seat: '14D' },
    ]);
  });

  it('refuses a journey the model returned with no legs in it', async () => {
    // Better an honest failure with the original attached than a row with no
    // route, which the reviewer has to notice is empty.
    vi.stubGlobal('fetch', geminiReplying({ type: 'segment', segments: [] }));
    const { parseBooking } = await import('../src/import/parse');
    const result = await parseBooking(email({ text: 'x' }), { apiKey: 'k', model: 'm' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no legs/i);
  });

  it('reads a Via Rail booking as a journey, not as an activity', async () => {
    /*
     * PLAN-V3 §3a: a train has everything a flight has, and landing it as a
     * generic activity threw the destination away — which is exactly the data a
     * conflict needs. Station names, because there is no IATA for stations.
     */
    vi.stubGlobal(
      'fetch',
      geminiReplying({
        type: 'segment',
        confirmationCode: 'VIA123',
        passengers: [{ name: 'David', seat: '11A' }],
        segments: [
          {
            mode: 'rail',
            carrier: 'Via Rail',
            service: '55',
            origin: 'Ottawa',
            departureLocal: '2026-09-10T08:30',
            destination: 'Toronto Union',
            arrivalLocal: '2026-09-10T13:00',
          },
          {
            mode: 'rail',
            carrier: 'Via Rail',
            service: '48',
            origin: 'Toronto Union',
            departureLocal: '2026-09-14T17:00',
            destination: 'Ottawa',
            arrivalLocal: '2026-09-14T21:30',
          },
        ],
      }),
    );

    const { parseBooking } = await import('../src/import/parse');
    const result = await parseBooking(email({ text: 'Via Rail itinerary' }), {
      apiKey: 'k',
      model: 'm',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.type).toBe('segment');
    const fields = result.draft.fields as {
      segments: { mode: string; destination: string }[];
      passengers: { seat: string }[];
    };
    expect(fields.segments).toHaveLength(2);
    expect(fields.segments[0]).toMatchObject({ mode: 'rail', destination: 'Toronto Union' });
    expect(fields.passengers[0]?.seat).toBe('11A');
  });

  it('does not invent a booking out of an email that is not one', async () => {
    vi.stubGlobal('fetch', geminiReplying({ type: 'unknown' }));
    const { parseBooking } = await import('../src/import/parse');
    const result = await parseBooking(email({ text: 'Your statement is ready.' }), {
      apiKey: 'k',
      model: 'm',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not recognised/i);
  });
});

describe('non-air journeys', () => {
  it('tells the model that rail is a segment and not an activity', async () => {
    // The mitigation this replaces put the route in an activity's name. It kept
    // the arrival; it never made the destination structured, so "you arrive in
    // Toronto but your hotel is in Montreal" stayed undetectable.
    const { readFileSync } = await import('node:fs');
    const file = readFileSync(new URL('../src/import/parse.ts', import.meta.url), 'utf8');
    expect(file).toMatch(/rail, coach or ferry booking is a "segment", NOT an activity/);
    expect(file).toMatch(/there is no IATA for stations/);
  });
});
