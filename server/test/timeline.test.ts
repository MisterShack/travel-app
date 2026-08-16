import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, jsonRequest, signUp, tokenFromMail, type Harness } from './helpers';

let h: Harness;
afterEach(() => h?.cleanup());

const TRIP = {
  name: 'Lisbon',
  startDate: '2026-09-10',
  endDate: '2026-09-18',
  homeTimezone: 'Europe/Lisbon',
};

async function setup() {
  h = await createHarness();
  const cookie = await signUp(h, 'a@example.com');
  const res = await h.app.request(jsonRequest('/trips', 'POST', TRIP, cookie));
  const { id } = (await res.json()) as { id: string };
  return { cookie, tripId: id };
}

const FLIGHT = {
  airline: 'TAP',
  flightNumber: 'TP1233',
  departureAirport: 'LHR',
  departure: { local: '2026-09-10T10:00', timezone: 'Europe/London' },
  arrivalAirport: 'LIS',
  arrival: { local: '2026-09-10T13:00', timezone: 'Europe/Lisbon' },
};

describe('creating timeline entities', () => {
  it('derives the UTC instant from local time and zone', async () => {
    const { cookie, tripId } = await setup();
    await h.app.request(jsonRequest(`/trips/${tripId}/flights`, 'POST', FLIGHT, cookie));

    const res = await h.app.request(jsonRequest(`/trips/${tripId}/timeline`, 'GET', undefined, cookie));
    const { items } = (await res.json()) as { items: Record<string, string>[] };

    // London 10:00 BST is 09:00Z; Lisbon 13:00 WEST is 12:00Z.
    expect(items[0]?.startAt).toBe('2026-09-10T09:00:00.000Z');
    expect(items[0]?.endAt).toBe('2026-09-10T12:00:00.000Z');
    // The local strings survive verbatim — they are the source of truth.
    expect(items[0]?.startLocal).toBe('2026-09-10T10:00');
  });

  it('ignores a client-supplied instant entirely', async () => {
    // The instant is derived, never trusted (PLAN.md §4).
    const { cookie, tripId } = await setup();
    await h.app.request(
      jsonRequest(
        `/trips/${tripId}/flights`,
        'POST',
        { ...FLIGHT, departureAt: '1999-01-01T00:00:00.000Z', startAt: '1999-01-01T00:00:00.000Z' },
        cookie,
      ),
    );

    const res = await h.app.request(jsonRequest(`/trips/${tripId}/timeline`, 'GET', undefined, cookie));
    const { items } = (await res.json()) as { items: Record<string, string>[] };
    expect(items[0]?.startAt).toBe('2026-09-10T09:00:00.000Z');
  });

  it('rejects an unknown timezone', async () => {
    const { cookie, tripId } = await setup();
    const res = await h.app.request(
      jsonRequest(
        `/trips/${tripId}/flights`,
        'POST',
        { ...FLIGHT, departure: { local: '2026-09-10T10:00', timezone: 'Europe/Nowhere' } },
        cookie,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('warns when a time falls in a DST gap instead of silently shifting it', async () => {
    const { cookie, tripId } = await setup();
    const res = await h.app.request(
      jsonRequest(
        `/trips/${tripId}/activities`,
        'POST',
        {
          kind: 'other',
          name: 'Clocks change',
          start: { local: '2026-03-29T01:30', timezone: 'Europe/London' },
        },
        cookie,
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { warnings?: string[] };
    expect(body.warnings?.[0]).toMatch(/does not exist/);
  });
});

describe('the merged timeline', () => {
  it('orders by UTC instant, not by local clock', async () => {
    // The whole point of PLAN.md §4. A flight landing at 13:00 local in a zone
    // behind the departure zone must still sort after an 11:00 local event in
    // the departure zone.
    const { cookie, tripId } = await setup();

    await h.app.request(jsonRequest(`/trips/${tripId}/flights`, 'POST', FLIGHT, cookie));
    await h.app.request(
      jsonRequest(
        `/trips/${tripId}/activities`,
        'POST',
        {
          kind: 'restaurant',
          name: 'Dinner in Lisbon',
          start: { local: '2026-09-10T20:00', timezone: 'Europe/Lisbon' },
        },
        cookie,
      ),
    );
    await h.app.request(
      jsonRequest(
        `/trips/${tripId}/lodging`,
        'POST',
        {
          name: 'Hotel Bairro',
          checkIn: { local: '2026-09-10T15:00', timezone: 'Europe/Lisbon' },
          checkOut: { local: '2026-09-18T11:00', timezone: 'Europe/Lisbon' },
        },
        cookie,
      ),
    );

    const res = await h.app.request(jsonRequest(`/trips/${tripId}/timeline`, 'GET', undefined, cookie));
    const { items } = (await res.json()) as { items: { kind: string; startAt: string }[] };

    expect(items.map((i) => i.kind)).toEqual(['flight', 'lodging', 'activity']);
    const instants = items.map((i) => i.startAt);
    expect([...instants].sort()).toEqual(instants);
  });

  it('is stable across reloads when two items share an instant', async () => {
    const { cookie, tripId } = await setup();
    const at = { local: '2026-09-11T09:00', timezone: 'Europe/Lisbon' };
    for (const name of ['Castle', 'Tram', 'Museum']) {
      await h.app.request(
        jsonRequest(`/trips/${tripId}/activities`, 'POST', { kind: 'attraction', name, start: at }, cookie),
      );
    }

    const read = async () => {
      const res = await h.app.request(jsonRequest(`/trips/${tripId}/timeline`, 'GET', undefined, cookie));
      return ((await res.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    };
    expect(await read()).toEqual(await read());
  });

  it('carries the airport\'s own city, not its zone\'s namesake', async () => {
    /*
     * YOW is Ottawa and sits in America/Toronto — as do Montreal, Detroit and
     * Iqaluit. Labelling the arrival from the zone alone told a traveller their
     * Winnipeg to Ottawa flight landed in Toronto. Reported from a real WestJet
     * import, 2026-08-16: the extraction was right, the label was not.
     */
    const { cookie, tripId } = await setup();
    await h.app.request(
      jsonRequest(
        `/trips/${tripId}/flights`,
        'POST',
        {
          airline: 'WestJet',
          flightNumber: 'WS3120',
          departureAirport: 'YWG',
          departure: { local: '2026-09-10T07:15', timezone: 'America/Winnipeg' },
          arrivalAirport: 'YOW',
          arrival: { local: '2026-09-10T10:40', timezone: 'America/Toronto' },
        },
        cookie,
      ),
    );

    const res = await h.app.request(jsonRequest(`/trips/${tripId}/timeline`, 'GET', undefined, cookie));
    const { items } = (await res.json()) as {
      items: { startPlace: string | null; endPlace: string | null; endTimezone: string }[];
    };
    expect(items[0]).toMatchObject({
      startPlace: 'Winnipeg',
      endPlace: 'Ottawa',
      endTimezone: 'America/Toronto',
    });
  });

  it('is empty for a new trip', async () => {
    const { cookie, tripId } = await setup();
    const res = await h.app.request(jsonRequest(`/trips/${tripId}/timeline`, 'GET', undefined, cookie));
    await expect(res.json()).resolves.toEqual({ items: [] });
  });
});

describe('authorisation on flat entity routes', () => {
  it('refuses a non-member editing an entity by id', async () => {
    // /flights/:id names no trip, so the check has to resolve entity -> trip.
    const { cookie, tripId } = await setup();
    const created = await h.app.request(jsonRequest(`/trips/${tripId}/flights`, 'POST', FLIGHT, cookie));
    const { id } = (await created.json()) as { id: string };

    const stranger = await signUp(h, 'b@example.com');
    expect((await h.app.request(jsonRequest(`/flights/${id}`, 'PATCH', FLIGHT, stranger))).status).toBe(404);
    expect((await h.app.request(jsonRequest(`/flights/${id}`, 'DELETE', undefined, stranger))).status).toBe(404);
  });

  it('lets a plain member add and edit, not just the owner', async () => {
    // A trip planner where only the owner can enter a hotel is pointless.
    const { cookie, tripId } = await setup();
    const member = await signUp(h, 'b@example.com');
    await h.app.request(jsonRequest(`/trips/${tripId}/invite`, 'POST', { email: 'b@example.com' }, cookie));
    await h.app.request(
      jsonRequest(`/invites/${tokenFromMail(h.mailer, 'b@example.com')}/accept`, 'POST', undefined, member),
    );

    const created = await h.app.request(jsonRequest(`/trips/${tripId}/flights`, 'POST', FLIGHT, member));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const edited = await h.app.request(
      jsonRequest(`/flights/${id}`, 'PATCH', { ...FLIGHT, seat: '14C' }, member),
    );
    expect(edited.status).toBe(200);
  });

  it('recomputes the instant on edit', async () => {
    const { cookie, tripId } = await setup();
    const created = await h.app.request(jsonRequest(`/trips/${tripId}/flights`, 'POST', FLIGHT, cookie));
    const { id } = (await created.json()) as { id: string };

    await h.app.request(
      jsonRequest(
        `/flights/${id}`,
        'PATCH',
        { ...FLIGHT, departure: { local: '2026-09-10T10:00', timezone: 'America/New_York' } },
        cookie,
      ),
    );

    const res = await h.app.request(jsonRequest(`/trips/${tripId}/timeline`, 'GET', undefined, cookie));
    const { items } = (await res.json()) as { items: { startAt: string }[] };
    // Same local string, different zone — the derived instant must follow.
    expect(items[0]?.startAt).toBe('2026-09-10T14:00:00.000Z');
  });
});

describe('deleting a trip', () => {
  it('takes its timeline with it', async () => {
    const { cookie, tripId } = await setup();
    await h.app.request(jsonRequest(`/trips/${tripId}/flights`, 'POST', FLIGHT, cookie));
    await h.app.request(jsonRequest(`/trips/${tripId}`, 'DELETE', undefined, cookie));

    const res = await h.app.request(jsonRequest(`/trips/${tripId}/timeline`, 'GET', undefined, cookie));
    expect(res.status).toBe(404);
  });
});
