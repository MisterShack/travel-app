import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_PASS_BYTES } from '@travel/shared';
import { readPkpass } from '../src/passes/pkpass';
import { createHarness, jsonRequest, signUp, type Harness } from './helpers';

let h: Harness;
afterEach(() => h?.cleanup());

/* ------------------------------------------------------------ a real zip -- */

/**
 * Builds a zip by hand, because the reader parses one by hand.
 *
 * A fixture file checked into the repo would prove the reader can open that
 * file; constructing the bytes here proves it can open the *format*, and lets a
 * test say "this is a zip with no pass.json in it" — which is precisely the
 * case the upload route leans on to tell a boarding pass from a `.docx`.
 */
function zip(files: Record<string, string>, { deflate = true } = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, contents] of Object.entries(files)) {
    const raw = Buffer.from(contents, 'utf8');
    const body = deflate ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(0, 14); // crc32 — the reader does not check it
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, eocd]);
}

const PASS_JSON = JSON.stringify({
  description: 'TAP TP442 — Lisbon to Paris',
  organizationName: 'TAP Air Portugal',
  barcodes: [{ message: 'M1SHACK/DAVID  ELIS123', format: 'PKBarcodeFormatAztec' }],
});

const pkpass = () => zip({ 'pass.json': PASS_JSON, 'logo.png': 'not really a png' });
const pdf = (size = 400) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(size, 0x20)]);

/* ----------------------------------------------------------- the reader --- */

describe('readPkpass', () => {
  it('reads the label and the barcode out of a deflated pass.json', () => {
    expect(readPkpass(pkpass())).toEqual({
      label: 'TAP TP442 — Lisbon to Paris',
      barcodeMessage: 'M1SHACK/DAVID  ELIS123',
      barcodeFormat: 'PKBarcodeFormatAztec',
    });
  });

  it('reads a stored (undeflated) entry too', () => {
    const summary = readPkpass(zip({ 'pass.json': PASS_JSON }, { deflate: false }));
    expect(summary?.label).toBe('TAP TP442 — Lisbon to Paris');
  });

  /** Real passes still ship the deprecated singular, and old ones only it. */
  it('falls back to the deprecated singular `barcode` key', () => {
    const legacy = JSON.stringify({
      description: 'Eurostar 9024',
      barcode: { message: 'ES9024ABC', format: 'PKBarcodeFormatQR' },
    });
    expect(readPkpass(zip({ 'pass.json': legacy }))).toEqual({
      label: 'Eurostar 9024',
      barcodeMessage: 'ES9024ABC',
      barcodeFormat: 'PKBarcodeFormatQR',
    });
  });

  /* The distinction the upload route rests on. */
  it('refuses a zip that is not a pass', () => {
    expect(readPkpass(zip({ 'word/document.xml': '<w:document/>' }))).toBeNull();
  });

  it('refuses junk rather than throwing', () => {
    expect(readPkpass(Buffer.from('PK\x03\x04 and then nothing at all'))).toBeNull();
    expect(readPkpass(Buffer.alloc(0))).toBeNull();
    expect(readPkpass(zip({ 'pass.json': 'not json' }))).toBeNull();
  });
});

/* ------------------------------------------------------------- the route -- */

const upload = (
  cookie: string,
  tripId: string,
  bytes: Buffer,
  filename = 'pass.pkpass',
  extra: Record<string, string> = {},
) => {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], filename));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return h.app.request(
    new Request(`http://localhost/api/trips/${tripId}/passes`, {
      method: 'POST',
      headers: { cookie },
      body: form,
    }),
  );
};

const newTrip = async (cookie: string) => {
  const res = await h.app.request(
    jsonRequest(
      '/trips',
      'POST',
      { name: 'Lisbon', startDate: '2027-03-01', endDate: '2027-03-08', homeTimezone: 'Europe/Lisbon' },
      cookie,
    ),
  );
  return ((await res.json()) as { id: string }).id;
};

describe('uploading a pass', () => {
  it('stores a PKPASS and reads its label without being told one', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);

    const res = await upload(cookie, tripId, pkpass());
    expect(res.status).toBe(201);

    const { pass } = (await res.json()) as { pass: Record<string, unknown> };
    expect(pass['contentType']).toBe('application/vnd.apple.pkpass');
    expect(pass['label']).toBe('TAP TP442 — Lisbon to Paris');
    expect(pass['source']).toBe('upload');
    // The bytes are never in a JSON response.
    expect(pass['data']).toBeUndefined();
  });

  it('stores a PDF, which has no label to read', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);

    const res = await upload(cookie, tripId, pdf(), 'ticket.pdf');
    expect(res.status).toBe(201);
    const { pass } = (await res.json()) as { pass: Record<string, unknown> };
    expect(pass['contentType']).toBe('application/pdf');
    expect(pass['label']).toBeNull();
  });

  /**
   * The core of the allowlist. An uploader's `Content-Type` is a header they
   * wrote; what the file *is* comes from its own first bytes.
   */
  it('refuses HTML dressed as a PDF', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);

    const html = Buffer.from('<script>fetch("/api/auth/me")</script>');
    const res = await upload(cookie, tripId, html, 'boarding-pass.pdf');
    expect(res.status).toBe(415);
  });

  it('refuses an SVG, which is a document that can run script', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    expect((await upload(cookie, tripId, svg, 'pass.svg')).status).toBe(415);
  });

  /** A zip is a zip. Only `pass.json` makes it a pass. */
  it('refuses a zip that is not an Apple Wallet pass', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);
    const res = await upload(cookie, tripId, zip({ 'holiday-photos/1.jpg': 'x' }), 'stuff.pkpass');
    expect(res.status).toBe(415);
    expect(((await res.json()) as { message: string }).message).toMatch(/zip file/i);
  });

  it('refuses a file over the ceiling', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);
    const huge = pdf(MAX_PASS_BYTES + 1);
    expect((await upload(cookie, tripId, huge, 'big.pdf')).status).toBe(413);
  });

  it('refuses an empty file', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);
    expect((await upload(cookie, tripId, Buffer.alloc(0), 'nothing.pdf')).status).toBe(400);
  });

  it('refuses a trip the uploader is not a member of', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'owner@example.com');
    const stranger = await signUp(h, 'stranger@example.com');
    const tripId = await newTrip(owner);

    // 404 rather than 403: a stranger learns nothing about what exists.
    expect((await upload(stranger, tripId, pdf(), 'x.pdf')).status).toBe(404);
  });

  it('is refused without a session', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);
    expect((await upload('', tripId, pdf(), 'x.pdf')).status).toBe(401);
  });
});

describe('downloading a pass', () => {
  const stored = async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);
    const res = await upload(cookie, tripId, pdf(), 'boarding pass.pdf');
    const { pass } = (await res.json()) as { pass: { id: string } };
    return { cookie, tripId, id: pass.id };
  };

  /**
   * The headers are the security boundary, not decoration. A file served from
   * our own origin and *rendered* is script with the session cookie attached.
   */
  it('is served as an attachment that cannot execute', async () => {
    const { cookie, id } = await stored();
    const res = await h.app.request(
      new Request(`http://localhost/api/passes/${id}/file`, { headers: { cookie } }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="boarding pass.pdf"');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(res.headers.get('cache-control')).toContain('no-store');

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('refuses a reader who is not on the trip', async () => {
    const { id } = await stored();
    const stranger = await signUp(h, 'stranger@example.com');
    const res = await h.app.request(
      new Request(`http://localhost/api/passes/${id}/file`, { headers: { cookie: stranger } }),
    );
    expect(res.status).toBe(404);
  });

  it('is refused without a session', async () => {
    const { id } = await stored();
    const res = await h.app.request(new Request(`http://localhost/api/passes/${id}/file`));
    expect(res.status).toBe(401);
  });
});

describe('binding a pass to an event', () => {
  it('attaches on upload, and lists under the trip', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);

    const created = await h.app.request(
      jsonRequest(
        `/trips/${tripId}/segments`,
        'POST',
        {
          mode: 'air',
          carrier: 'TAP',
          service: 'TP442',
          origin: 'LIS',
          departure: { local: '2027-03-02T10:00', timezone: 'Europe/Lisbon' },
          destination: 'CDG',
          arrival: { local: '2027-03-02T13:30', timezone: 'Europe/Paris' },
        },
        cookie,
      ),
    );
    const segmentId = ((await created.json()) as { id: string }).id;

    const res = await upload(cookie, tripId, pkpass(), 'tp442.pkpass', {
      relatedType: 'segment',
      relatedId: segmentId,
    });
    expect(res.status).toBe(201);

    const list = await h.app.request(jsonRequest(`/trips/${tripId}/passes`, 'GET', undefined, cookie));
    const { passes } = (await list.json()) as { passes: { relatedId: string | null }[] };
    expect(passes).toHaveLength(1);
    expect(passes[0]?.relatedId).toBe(segmentId);
  });

  /**
   * Without this, a member of two trips could staple a pass from one onto an
   * event in the other, and it would then show on a trip it does not belong to.
   */
  it('refuses an event that is on a different trip', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripA = await newTrip(cookie);
    const tripB = await newTrip(cookie);

    const created = await h.app.request(
      jsonRequest(
        `/trips/${tripB}/activities`,
        'POST',
        { kind: 'other', name: 'Thing', start: { local: '2027-03-03T10:00', timezone: 'Europe/Lisbon' } },
        cookie,
      ),
    );
    const otherId = ((await created.json()) as { id: string }).id;

    const res = await upload(cookie, tripA, pdf(), 'x.pdf');
    const { pass } = (await res.json()) as { pass: { id: string } };

    const rebind = await h.app.request(
      jsonRequest(`/passes/${pass.id}`, 'PATCH', { relatedType: 'activity', relatedId: otherId }, cookie),
    );
    expect(rebind.status).toBe(400);
  });

  it('detaches back to the trip', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);
    const res = await upload(cookie, tripId, pdf(), 'x.pdf');
    const { pass } = (await res.json()) as { pass: { id: string } };

    const detached = await h.app.request(
      jsonRequest(`/passes/${pass.id}`, 'PATCH', { relatedType: null, relatedId: null }, cookie),
    );
    expect(detached.status).toBe(200);
    expect(((await detached.json()) as { pass: { relatedType: null } }).pass.relatedType).toBeNull();
  });

  it('refuses a half-binding, which nothing could resolve', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);
    const res = await upload(cookie, tripId, pdf(), 'x.pdf');
    const { pass } = (await res.json()) as { pass: { id: string } };

    const bad = await h.app.request(
      jsonRequest(`/passes/${pass.id}`, 'PATCH', { relatedType: 'segment', relatedId: null }, cookie),
    );
    expect(bad.status).toBe(400);
  });
});

describe('the passes page', () => {
  it('gathers passes from every trip the reader is on, and no others', async () => {
    h = await createHarness();
    const mine = await signUp(h, 'a@example.com');
    const theirs = await signUp(h, 'b@example.com');

    const myTrip = await newTrip(mine);
    await upload(mine, myTrip, pdf(), 'mine.pdf');

    const theirTrip = await newTrip(theirs);
    await upload(theirs, theirTrip, pdf(), 'theirs.pdf');

    const res = await h.app.request(jsonRequest('/passes', 'GET', undefined, mine));
    const { passes } = (await res.json()) as { passes: { filename: string; tripName: string }[] };
    expect(passes.map((p) => p.filename)).toEqual(['mine.pdf']);
    expect(passes[0]?.tripName).toBe('Lisbon');
  });

  it('is refused without a session', async () => {
    h = await createHarness();
    expect((await h.app.request(jsonRequest('/passes', 'GET'))).status).toBe(401);
  });
});

describe('deleting a pass', () => {
  it('removes it, and a stranger cannot', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const stranger = await signUp(h, 'b@example.com');
    const tripId = await newTrip(cookie);
    const res = await upload(cookie, tripId, pdf(), 'x.pdf');
    const { pass } = (await res.json()) as { pass: { id: string } };

    expect((await h.app.request(jsonRequest(`/passes/${pass.id}`, 'DELETE', undefined, stranger))).status).toBe(404);
    expect((await h.app.request(jsonRequest(`/passes/${pass.id}`, 'DELETE', undefined, cookie))).status).toBe(200);

    const list = await h.app.request(jsonRequest(`/trips/${tripId}/passes`, 'GET', undefined, cookie));
    expect(((await list.json()) as { passes: unknown[] }).passes).toHaveLength(0);
  });
});

describe('cross-origin', () => {
  /**
   * A multipart POST is a CORS *simple* request: no preflight, so an attacker's
   * page can send one and the browser will attach the session cookie. Nothing
   * stops it reaching the server — `originGuard` is what stops it being obeyed,
   * and this is the first route where the consequence of getting that wrong is
   * a file of the attacker's choosing stored under someone else's account.
   */
  it('refuses an upload announcing a foreign origin', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const tripId = await newTrip(cookie);

    const form = new FormData();
    form.set('file', new File([new Uint8Array(pdf())], 'evil.pdf'));
    const res = await h.app.request(
      new Request(`http://localhost/api/trips/${tripId}/passes`, {
        method: 'POST',
        headers: { cookie, origin: 'https://evil.example' },
        body: form,
      }),
    );

    expect(res.status).toBe(403);
    const list = await h.app.request(jsonRequest(`/trips/${tripId}/passes`, 'GET', undefined, cookie));
    expect(((await list.json()) as { passes: unknown[] }).passes).toHaveLength(0);
  });
});
