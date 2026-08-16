import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
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
    expect(rows[0]?.extractedType).toBe('flight');
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
    // A flight number alone, or one airport alone, is far too easy to hit by
    // accident — a wrong guess costs a human more than no guess.
    expect(parseHeuristic(email({ text: 'Flight TP 1233 confirmed.' }))).toBeNull();
    expect(parseHeuristic(email({ text: 'LHR to LIS next week.' }))).toBeNull();
    const both = parseHeuristic(email({ text: 'TP 1233 from LHR to LIS' }));
    expect(both?.ok).toBe(true);
  });

  it('does not treat ordinary three-letter words as airports', () => {
    // "VAT" and "USD" are not airports; an unchecked match invents itineraries.
    expect(parseHeuristic(email({ text: 'Total inc VAT in USD was 250. Ref AB12345' }))).toBeNull();
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
