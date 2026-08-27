import { test, expect, createTrip } from '../fixtures/test';

/**
 * Stored passes, through the real stack.
 *
 * The unit suite exercises these routes through Hono's own `app.request`, which
 * never touches a socket. What that cannot prove is the part that matters most
 * here: that the **response headers survive the journey**. A pass is served from
 * the app's own origin, and `Content-Disposition: attachment` is the single
 * thing standing between that and a file the browser will render with the
 * session cookie attached. It passes through Vite's dev proxy on the way — the
 * deployed shape puts one process in front of both — so a header dropped or
 * rewritten in transit is a real failure mode a unit test is blind to.
 */

test.use({
  storageState: ({ storageStatePath }, use) => use(storageStatePath),
  locale: 'en-US',
});

/** The smallest thing that sniffs as a PDF. */
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(256, 0x20)]);

async function uploadPass(
  request: import('@playwright/test').APIRequestContext,
  tripId: string,
  body: Buffer,
  name: string,
) {
  return request.post(`/api/trips/${tripId}/passes`, {
    multipart: { file: { name, mimeType: 'application/pdf', buffer: body } },
  });
}

test.describe('a stored pass', () => {
  test('comes back with the headers that stop it executing', async ({ request }) => {
    const trip = await createTrip(request, { homeTimezone: 'Europe/Lisbon' });
    const created = await uploadPass(request, trip.id, PDF, 'boarding pass.pdf');
    expect(created.status(), `upload failed: ${await created.text()}`).toBe(201);
    const { pass } = (await created.json()) as { pass: { id: string; contentType: string } };
    expect(pass.contentType).toBe('application/pdf');

    const file = await request.get(`/api/passes/${pass.id}/file`);
    expect(file.status()).toBe(200);

    const headers = file.headers();
    // The load-bearing one. Without it a browser renders the file in place, and
    // anything it renders from this origin runs with the session cookie.
    expect(headers['content-disposition']).toBe('attachment; filename="boarding pass.pdf"');
    expect(headers['content-type']).toContain('application/pdf');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain('sandbox');
    expect(headers['cache-control']).toContain('no-store');

    // And the bytes are the bytes.
    expect(Buffer.from(await file.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  /**
   * The allowlist, through the real stack. The uploader here says `application/pdf`
   * in the multipart part — the server is supposed to disbelieve it and read the
   * bytes, which begin with `<script`.
   */
  test('refuses script wearing a PDF content type', async ({ request }) => {
    const trip = await createTrip(request, { homeTimezone: 'Europe/Lisbon' });
    const html = Buffer.from('<script>fetch("/api/auth/me").then(r=>r.json())</script>');
    const res = await uploadPass(request, trip.id, html, 'totally-a-boarding-pass.pdf');
    expect(res.status()).toBe(415);
  });

  test('is listed under its trip and on the passes endpoint', async ({ request }) => {
    const trip = await createTrip(request, { name: `Passes ${Date.now()}`, homeTimezone: 'Europe/Lisbon' });
    await uploadPass(request, trip.id, PDF, 'ticket.pdf');

    const underTrip = await request.get(`/api/trips/${trip.id}/passes`);
    expect(((await underTrip.json()) as { passes: unknown[] }).passes).toHaveLength(1);

    const all = await request.get('/api/passes');
    const { passes } = (await all.json()) as { passes: { tripName: string; filename: string }[] };
    expect(passes.some((p) => p.tripName === trip.name && p.filename === 'ticket.pdf')).toBe(true);
  });

  test('binds to an event on its own trip', async ({ request }) => {
    const trip = await createTrip(request, { homeTimezone: 'Europe/Lisbon' });
    const segment = await request.post(`/api/trips/${trip.id}/segments`, {
      data: {
        mode: 'air',
        carrier: 'TAP',
        service: 'TP442',
        origin: 'LIS',
        departure: { local: '2027-03-02T10:00', timezone: 'Europe/Lisbon' },
        destination: 'CDG',
        arrival: { local: '2027-03-02T13:30', timezone: 'Europe/Paris' },
      },
    });
    const segmentId = ((await segment.json()) as { id: string }).id;

    const created = await request.post(`/api/trips/${trip.id}/passes`, {
      multipart: {
        file: { name: 'tp442.pdf', mimeType: 'application/pdf', buffer: PDF },
        relatedType: 'segment',
        relatedId: segmentId,
      },
    });
    expect(created.status()).toBe(201);
    const { pass } = (await created.json()) as { pass: { relatedId: string | null } };
    expect(pass.relatedId).toBe(segmentId);
  });

  test('is refused to someone with no session', async ({ request, playwright, baseURL }) => {
    const trip = await createTrip(request, { homeTimezone: 'Europe/Lisbon' });
    const created = await uploadPass(request, trip.id, PDF, 'private.pdf');
    const { pass } = (await created.json()) as { pass: { id: string } };

    /*
     * `storageState` is forced empty rather than merely omitted. Omitting it
     * inherits this file's `test.use` state, so the "anonymous" context arrived
     * carrying `travel_session` and the request was authorised — the assertion
     * passed a 200 back and would have read as the app serving passes to
     * strangers. A test that quietly authenticates itself proves nothing.
     */
    const anonymous = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    expect((await anonymous.get(`/api/passes/${pass.id}/file`)).status()).toBe(401);
    await anonymous.dispose();
  });
});
