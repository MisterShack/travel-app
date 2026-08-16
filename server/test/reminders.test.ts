import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { pushSubscriptions, reminders } from '../src/db/schema';
import { DEFAULT_LEAD_MINUTES } from '../src/notify/reminders';
import { MemoryPusher } from '../src/notify/push';
import { sweepOnce, STALE_AFTER_MS } from '../src/notify/sweep';
import { createHarness, jsonRequest, signUp, tokenFromMail, type Harness } from './helpers';

let h: Harness;
afterEach(() => h?.cleanup());

const NOW = new Date('2026-08-15T12:00:00.000Z');
const TRIP = { name: 'Lisbon', startDate: '2026-09-10', endDate: '2026-09-18', homeTimezone: 'Europe/Lisbon' };
const FLIGHT = {
  airline: 'TAP',
  flightNumber: 'TP1233',
  departureAirport: 'LHR',
  departure: { local: '2026-09-10T10:00', timezone: 'Europe/London' },
  arrivalAirport: 'LIS',
  arrival: { local: '2026-09-10T13:00', timezone: 'Europe/Lisbon' },
};

async function trip(cookie: string) {
  const res = await h.app.request(jsonRequest('/trips', 'POST', TRIP, cookie));
  return ((await res.json()) as { id: string }).id;
}
async function addFlight(cookie: string, tripId: string, over: Partial<typeof FLIGHT> = {}) {
  const res = await h.app.request(jsonRequest(`/trips/${tripId}/flights`, 'POST', { ...FLIGHT, ...over }, cookie));
  return ((await res.json()) as { id: string }).id;
}
const rowsFor = (tripId: string) => h.db.select().from(reminders).where(eq(reminders.tripId, tripId));

describe('fan-out', () => {
  it('creates one reminder per member, not one per event', async () => {
    // A single sentAt cannot represent "sent to two of four members", which is
    // why the recipient is on the row (PLAN.md §7).
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const member = await signUp(h, 'b@example.com');
    const id = await trip(owner);
    await h.app.request(jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'b@example.com' }, owner));
    await h.app.request(
      jsonRequest(`/invites/${tokenFromMail(h.mailer, 'b@example.com')}/accept`, 'POST', undefined, member),
    );

    await addFlight(owner, id);
    const rows = await rowsFor(id);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.userId)).size).toBe(2);
    expect(rows.every((r) => r.channel === 'email')).toBe(true);
  });

  it('skips a member who has muted the trip', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    await h.app.request(jsonRequest(`/trips/${id}/reminders`, 'POST', { enabled: false }, cookie));

    await addFlight(cookie, id);
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it('adds a push row only for a subscribed browser', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    await h.app.request(
      jsonRequest('/push/subscribe', 'POST', { endpoint: 'https://push.example/x', keys: { p256dh: 'k', auth: 'a' } }, cookie),
    );

    await addFlight(cookie, id);
    const rows = await rowsFor(id);
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(['email', 'push']));
  });

  it('fires at the type-specific lead time', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    await addFlight(cookie, id);

    const [row] = await rowsFor(id);
    // Departure is 2026-09-10T09:00Z; flights lead by 3 hours.
    expect(row?.remindAt).toBe('2026-09-10T06:00:00.000Z');
    expect(DEFAULT_LEAD_MINUTES.flight).toBe(180);
  });

  it('creates nothing for an event whose reminder time has already passed', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    // Departs 30 minutes from the harness clock — the 3h lead is in the past.
    await addFlight(cookie, id, {
      departure: { local: '2026-08-15T13:30', timezone: 'UTC' },
      arrival: { local: '2026-08-15T15:30', timezone: 'UTC' },
    });
    expect(await rowsFor(id)).toHaveLength(0);
  });
});

describe('regeneration', () => {
  it('follows an edited departure time', async () => {
    // Otherwise a delayed flight still pings you three hours before the old one.
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    const flightId = await addFlight(cookie, id);
    expect((await rowsFor(id))[0]?.remindAt).toBe('2026-09-10T06:00:00.000Z');

    await h.app.request(
      jsonRequest(
        `/flights/${flightId}`,
        'PATCH',
        { ...FLIGHT, departure: { local: '2026-09-10T14:00', timezone: 'Europe/London' } },
        cookie,
      ),
    );
    const rows = await rowsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.remindAt).toBe('2026-09-10T10:00:00.000Z');
  });

  it('removes pending reminders when the event is deleted', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    const flightId = await addFlight(cookie, id);
    await h.app.request(jsonRequest(`/flights/${flightId}`, 'DELETE', undefined, cookie));
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it('leaves an already-sent reminder alone', async () => {
    // Sent rows are a record of what was delivered; deleting them would both
    // rewrite history and remove the stamp that stops a resend.
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    const flightId = await addFlight(cookie, id);
    await h.db.update(reminders).set({ sentAt: NOW.toISOString() }).where(eq(reminders.tripId, id));

    await h.app.request(jsonRequest(`/flights/${flightId}`, 'PATCH', { ...FLIGHT, seat: '3A' }, cookie));
    const rows = await rowsFor(id);
    expect(rows.filter((r) => r.sentAt !== null)).toHaveLength(1);
  });
});

describe('the sweep', () => {
  const deps = () => ({ db: h.db, mailer: h.mailer, pusher: new MemoryPusher() });

  async function dueFlight() {
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    await addFlight(cookie, id);
    return { cookie, tripId: id };
  }

  it('sends a due reminder exactly once, even across overlapping passes', async () => {
    // Claim-before-send is what makes this true: select-send-stamp duplicates
    // every notification whose send outlasts one tick.
    h = await createHarness();
    const { tripId } = await dueFlight();
    const at = new Date('2026-09-10T06:00:00.000Z');
    const d = deps();

    const [a, b] = await Promise.all([sweepOnce(d, at), sweepOnce(d, at)]);
    expect(a.sent + b.sent).toBe(1);

    const mails = h.mailer.sent.filter((m) => m.subject.includes('TP1233'));
    expect(mails).toHaveLength(1);
    const rows = await rowsFor(tripId);
    expect(rows[0]?.sentAt).not.toBeNull();
  });

  it('names the airport\'s city in the message, not its zone\'s', async () => {
    /*
     * "departs at 07:15 (Toronto)" for a flight out of Winnipeg to Ottawa. The
     * zone is right — YOW is in America/Toronto — but a zone is not a place,
     * and the reminder is read by someone standing in an airport.
     */
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    await addFlight(cookie, id, {
      airline: 'WestJet',
      flightNumber: 'WS3120',
      departureAirport: 'YWG',
      departure: { local: '2026-09-10T07:15', timezone: 'America/Winnipeg' },
      arrivalAirport: 'YOW',
      arrival: { local: '2026-09-10T10:40', timezone: 'America/Toronto' },
    });

    const rows = await rowsFor(id);
    expect(rows[0]?.body).toContain('(Winnipeg)');
    expect(rows[0]?.body).not.toContain('Toronto');
  });

  it('does not send anything before it is due', async () => {
    h = await createHarness();
    await dueFlight();
    const result = await sweepOnce(deps(), new Date('2026-09-10T05:00:00.000Z'));
    expect(result.sent).toBe(0);
  });

  it('drops work that is too late to be useful', async () => {
    // "Your flight departs in 3 hours" arriving after it left is worse than
    // silence, because it is actively misleading.
    h = await createHarness();
    const { tripId } = await dueFlight();
    const late = new Date(Date.parse('2026-09-10T06:00:00.000Z') + STALE_AFTER_MS + 60_000);

    const result = await sweepOnce(deps(), late);
    expect(result.stale).toBe(1);
    expect(result.sent).toBe(0);
    const rows = await rowsFor(tripId);
    expect(rows[0]?.error).toBe('stale');
    expect(rows[0]?.sentAt).toBeNull();
  });

  it('skips a reminder whose event has been deleted', async () => {
    // relatedId is polymorphic, so no foreign key can prevent the orphan.
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    await addFlight(cookie, id);
    // Delete the flight directly, leaving the reminder behind.
    await h.db.delete((await import('../src/db/schema')).flights);

    const result = await sweepOnce(deps(), new Date('2026-09-10T06:00:00.000Z'));
    expect(result.orphaned).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('records a failure without losing the row', async () => {
    h = await createHarness();
    const { tripId } = await dueFlight();
    const failing = {
      db: h.db,
      mailer: { send: () => Promise.reject(new Error('provider down')) },
      pusher: new MemoryPusher(),
    };

    const result = await sweepOnce(failing, new Date('2026-09-10T06:00:00.000Z'));
    expect(result.failed).toBe(1);
    const rows = await rowsFor(tripId);
    expect(rows[0]?.error).toContain('provider down');
    expect(rows[0]?.sentAt).toBeNull();
  });

  it('delivers push to every browser the person has registered', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await trip(cookie);
    for (const e of ['https://push.example/phone', 'https://push.example/laptop']) {
      await h.app.request(jsonRequest('/push/subscribe', 'POST', { endpoint: e, keys: { p256dh: 'k', auth: 'a' } }, cookie));
    }
    await addFlight(cookie, id);

    const pusher = new MemoryPusher();
    await sweepOnce({ db: h.db, mailer: h.mailer, pusher }, new Date('2026-09-10T06:00:00.000Z'));
    expect(pusher.sent.map((s) => s.endpoint).sort()).toEqual([
      'https://push.example/laptop',
      'https://push.example/phone',
    ]);
  });
});

describe('push subscriptions', () => {
  it('updates rather than duplicating when a browser re-subscribes', async () => {
    // A service-worker update re-registers the same endpoint; inserting blindly
    // would mean one person receiving each reminder several times.
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const body = { endpoint: 'https://push.example/x', keys: { p256dh: 'k1', auth: 'a1' } };
    await h.app.request(jsonRequest('/push/subscribe', 'POST', body, cookie));
    await h.app.request(
      jsonRequest('/push/subscribe', 'POST', { ...body, keys: { p256dh: 'k2', auth: 'a2' } }, cookie),
    );

    const rows = await h.db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.p256dh).toBe('k2');
  });

  it('will not let one account unsubscribe another', async () => {
    h = await createHarness();
    const a = await signUp(h, 'a@example.com');
    const b = await signUp(h, 'b@example.com');
    await h.app.request(
      jsonRequest('/push/subscribe', 'POST', { endpoint: 'https://push.example/x', keys: { p256dh: 'k', auth: 'a' } }, a),
    );
    await h.app.request(jsonRequest('/push/unsubscribe', 'POST', { endpoint: 'https://push.example/x' }, b));
    expect(await h.db.select().from(pushSubscriptions)).toHaveLength(1);
  });
});

describe('muting', () => {
  it('is per trip, not per user', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const one = await trip(cookie);
    const two = await trip(cookie);
    await h.app.request(jsonRequest(`/trips/${one}/reminders`, 'POST', { enabled: false }, cookie));

    await addFlight(cookie, one);
    await addFlight(cookie, two);
    expect(await rowsFor(one)).toHaveLength(0);
    expect(await rowsFor(two)).toHaveLength(1);
  });
});
