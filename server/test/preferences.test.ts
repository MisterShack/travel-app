import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { reminders, users } from '../src/db/schema';
import { createHarness, jsonRequest, signUp, type Harness } from './helpers';

let h: Harness;
afterEach(() => h?.cleanup());

type MeBody = {
  user: { id: string; email: string; preferences: { timeFormat: string; theme: string } };
};

const me = async (cookie: string) =>
  (await (await h.app.request(jsonRequest('/auth/me', 'GET', undefined, cookie))).json()) as MeBody;

const patch = (cookie: string, body: unknown) =>
  h.app.request(jsonRequest('/auth/me/preferences', 'PATCH', body, cookie));

describe('display preferences', () => {
  it('starts every account following the device on both axes', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    expect((await me(cookie)).user.preferences).toEqual({ timeFormat: 'auto', theme: 'system' });
  });

  it('saves one field without disturbing the other', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');

    await patch(cookie, { theme: 'dark' });
    const after = await patch(cookie, { timeFormat: '12' });

    expect(after.status).toBe(200);
    // The second write must not have reverted the first — the Account screen
    // changes one control at a time, and a put would have.
    expect(((await after.json()) as MeBody).user.preferences).toEqual({
      timeFormat: '12',
      theme: 'dark',
    });
    expect((await me(cookie)).user.preferences).toEqual({ timeFormat: '12', theme: 'dark' });
  });

  it('refuses a value outside the enum', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    expect((await patch(cookie, { theme: 'solarized' })).status).toBe(400);
    expect((await me(cookie)).user.preferences.theme).toBe('system');
  });

  it('refuses a patch that changes nothing', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    expect((await patch(cookie, {})).status).toBe(400);
  });

  /**
   * The route writes whatever survives validation onto the user row, so a field
   * that is not a preference must never reach the `set`. PLAN.md §4 — the
   * server never trusts the client.
   */
  it('cannot be used to write a column that is not a preference', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const before = await me(cookie);

    const res = await patch(cookie, {
      theme: 'dark',
      email: 'attacker@example.com',
      emailVerifiedAt: '2020-01-01T00:00:00.000Z',
      passwordHash: 'nope',
    });

    expect(res.status).toBe(200);
    const [row] = await h.db.select().from(users).where(eq(users.id, before.user.id));
    expect(row?.email).toBe('a@example.com');
    expect(row?.passwordHash).not.toBe('nope');
    expect(row?.theme).toBe('dark');
  });

  it('is refused without a session', async () => {
    h = await createHarness();
    expect((await h.app.request(jsonRequest('/auth/me/preferences', 'PATCH', { theme: 'dark' }))).status).toBe(401);
  });
});

describe('a reminder is written in its recipient\'s own format', () => {
  const TRIP = {
    name: 'Lisbon',
    startDate: '2026-09-10',
    endDate: '2026-09-18',
    homeTimezone: 'Europe/Lisbon',
  };
  const FLIGHT = {
    mode: 'air' as const,
    carrier: 'TAP',
    service: 'TP1233',
    origin: 'LHR',
    departure: { local: '2026-09-10T19:30', timezone: 'Europe/London' },
    destination: 'LIS',
    arrival: { local: '2026-09-10T22:00', timezone: 'Europe/Lisbon' },
  };

  it('uses 12-hour for the traveller who asked for it', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    await patch(cookie, { timeFormat: '12' });

    const tripId = ((await (await h.app.request(jsonRequest('/trips', 'POST', TRIP, cookie))).json()) as { id: string }).id;
    await h.app.request(jsonRequest(`/trips/${tripId}/segments`, 'POST', FLIGHT, cookie));

    const [row] = await h.db.select().from(reminders).where(eq(reminders.tripId, tripId));
    expect(row?.body).toMatch(/7:30\s*PM/);
    expect(row?.body).not.toContain('19:30');
  });

  /**
   * `auto` on the server means 24-hour, because this runs in a datacentre whose
   * locale is not the traveller's — and because that is exactly what these
   * messages said before the preference existed.
   */
  it('uses 24-hour for auto, unchanged from before the preference existed', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');

    const tripId = ((await (await h.app.request(jsonRequest('/trips', 'POST', TRIP, cookie))).json()) as { id: string }).id;
    await h.app.request(jsonRequest(`/trips/${tripId}/segments`, 'POST', FLIGHT, cookie));

    const [row] = await h.db.select().from(reminders).where(eq(reminders.tripId, tripId));
    expect(row?.body).toContain('19:30');
  });
});
