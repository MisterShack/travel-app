import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema';
import { acceptInvite } from '../src/trip/invites';
import { createHarness, jsonRequest, signUp, tokenFromMail, type Harness } from './helpers';

let h: Harness;
afterEach(() => h?.cleanup());

const TRIP = {
  name: 'Lisbon',
  destination: 'Portugal',
  startDate: '2026-09-10',
  endDate: '2026-09-18',
  homeTimezone: 'Europe/Lisbon',
};

async function makeTrip(cookie: string, body: Record<string, unknown> = TRIP): Promise<string> {
  const res = await h.app.request(jsonRequest('/trips', 'POST', body, cookie));
  const json = (await res.json()) as { id: string };
  return json.id;
}

describe('creating a trip', () => {
  it('makes the creator its owner', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await makeTrip(cookie);

    const res = await h.app.request(jsonRequest(`/trips/${id}`, 'GET', undefined, cookie));
    const body = (await res.json()) as { trip: { role: string }; members: unknown[] };
    expect(body.trip.role).toBe('owner');
    expect(body.members).toHaveLength(1);
  });

  it('rejects an unknown timezone', async () => {
    // PLAN.md §4 makes the zone load-bearing for every conversion, so it is
    // validated against the platform's database rather than a pattern.
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const res = await h.app.request(
      jsonRequest('/trips', 'POST', { ...TRIP, homeTimezone: 'Europe/Nowhere' }, cookie),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a trip that ends before it starts', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const res = await h.app.request(
      jsonRequest('/trips', 'POST', { ...TRIP, endDate: '2026-09-01' }, cookie),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a date that is not a real calendar date', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const res = await h.app.request(
      jsonRequest('/trips', 'POST', { ...TRIP, startDate: '2026-02-31' }, cookie),
    );
    expect(res.status).toBe(400);
  });

  it('refuses an unauthenticated caller', async () => {
    h = await createHarness();
    expect((await h.app.request(jsonRequest('/trips', 'POST', TRIP))).status).toBe(401);
  });
});

describe('authorisation', () => {
  it('hides a trip from a non-member behind 404, not 403', async () => {
    // Whether a trip id exists is not something a stranger gets to learn.
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const stranger = await signUp(h, 'b@example.com');
    const id = await makeTrip(owner);

    expect((await h.app.request(jsonRequest(`/trips/${id}`, 'GET', undefined, stranger))).status).toBe(404);
  });

  it('never lists a trip the caller does not belong to', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const stranger = await signUp(h, 'b@example.com');
    await makeTrip(owner);

    const res = await h.app.request(jsonRequest('/trips', 'GET', undefined, stranger));
    await expect(res.json()).resolves.toEqual({ trips: [] });
  });
});

describe('invites', () => {
  it('binds redemption to the invited address', async () => {
    // A forwarded or intercepted link joins nothing (PLAN.md §4).
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const wrongAccount = await signUp(h, 'c@example.com');
    const id = await makeTrip(owner);

    await h.app.request(jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'b@example.com' }, owner));
    const token = tokenFromMail(h.mailer, 'b@example.com');

    const res = await h.app.request(
      jsonRequest(`/invites/${token}/accept`, 'POST', undefined, wrongAccount),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'wrong_account' });
  });

  it('refuses an unverified account, so an invite cannot substitute for verification', async () => {
    // Tested at the module rather than over HTTP: an unverified account cannot
    // log in, so it never has a cookie to redeem with. That makes this guard
    // defence in depth, and defence in depth still has to work — it is what
    // stops any future login path from quietly becoming a verification bypass.
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const id = await makeTrip(owner);

    await h.app.request(
      jsonRequest('/auth/register', 'POST', { email: 'b@example.com', password: 'correct horse battery' }),
    );
    const unverified = (await h.db.select().from(users).where(eq(users.email, 'b@example.com')).limit(1))[0];
    expect(unverified?.emailVerifiedAt).toBeNull();

    await h.app.request(jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'b@example.com' }, owner));
    const token = tokenFromMail(h.mailer, 'b@example.com');

    const result = await acceptInvite(h.db, token, unverified!.id, new Date('2026-08-15T12:00:00.000Z'));
    expect(result).toEqual({ ok: false, reason: 'unverified' });
  });

  it('joins the trip as a member and is single-use', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const invitee = await signUp(h, 'b@example.com');
    const id = await makeTrip(owner);

    await h.app.request(jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'b@example.com' }, owner));
    const token = tokenFromMail(h.mailer, 'b@example.com');

    const first = await h.app.request(jsonRequest(`/invites/${token}/accept`, 'POST', undefined, invitee));
    expect(first.status).toBe(200);

    const second = await h.app.request(jsonRequest(`/invites/${token}/accept`, 'POST', undefined, invitee));
    expect(second.status).toBe(404);

    const trips = (await (await h.app.request(jsonRequest('/trips', 'GET', undefined, invitee))).json()) as {
      trips: { role: string }[];
    };
    expect(trips.trips).toHaveLength(1);
    expect(trips.trips[0]?.role).toBe('member');
  });

  it('describes an invite without authentication, revealing only the trip', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const id = await makeTrip(owner);
    await h.app.request(jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'b@example.com' }, owner));
    const token = tokenFromMail(h.mailer, 'b@example.com');

    const res = await h.app.request(`http://localhost/api/invites/${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invite: Record<string, unknown> };
    expect(body.invite).toMatchObject({ trip: 'Lisbon', email: 'b@example.com' });
    // Must not leak whether that address already has an account.
    expect(JSON.stringify(body)).not.toMatch(/hasAccount|registered|userId/i);
  });

  it('lets an owner revoke a pending invite', async () => {
    // Without this, an address typed wrong stays a live key for seven days.
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const invitee = await signUp(h, 'b@example.com');
    const id = await makeTrip(owner);

    await h.app.request(jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'b@example.com' }, owner));
    const token = tokenFromMail(h.mailer, 'b@example.com');

    const list = (await (await h.app.request(jsonRequest(`/trips/${id}/invites`, 'GET', undefined, owner))).json()) as {
      invites: { id: string }[];
    };
    expect(list.invites).toHaveLength(1);

    await h.app.request(jsonRequest(`/trips/${id}/invites/${list.invites[0]?.id}`, 'DELETE', undefined, owner));

    const res = await h.app.request(jsonRequest(`/invites/${token}/accept`, 'POST', undefined, invitee));
    expect(res.status).toBe(404);
  });

  it('refuses a member who is not an owner', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const member = await signUp(h, 'b@example.com');
    const id = await makeTrip(owner);
    await h.app.request(jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'b@example.com' }, owner));
    await h.app.request(
      jsonRequest(`/invites/${tokenFromMail(h.mailer, 'b@example.com')}/accept`, 'POST', undefined, member),
    );

    const res = await h.app.request(
      jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'c@example.com' }, member),
    );
    expect(res.status).toBe(403);
  });
});

describe('the at-least-one-owner invariant', () => {
  it('refuses to let the last owner leave', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const id = await makeTrip(owner);

    const res = await h.app.request(jsonRequest(`/trips/${id}/leave`, 'POST', undefined, owner));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: 'last_owner' });
  });

  it('refuses to let the last owner be removed', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const id = await makeTrip(owner);

    const me = (await (await h.app.request(jsonRequest('/auth/me', 'GET', undefined, owner))).json()) as {
      user: { id: string };
    };
    const res = await h.app.request(
      jsonRequest(`/trips/${id}/members/${me.user.id}`, 'DELETE', undefined, owner),
    );
    expect(res.status).toBe(409);
  });

  it('lets an owner leave once ownership has been granted to someone else', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const member = await signUp(h, 'b@example.com');
    const id = await makeTrip(owner);

    await h.app.request(jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'b@example.com' }, owner));
    await h.app.request(
      jsonRequest(`/invites/${tokenFromMail(h.mailer, 'b@example.com')}/accept`, 'POST', undefined, member),
    );
    const them = (await (await h.app.request(jsonRequest('/auth/me', 'GET', undefined, member))).json()) as {
      user: { id: string };
    };

    await h.app.request(jsonRequest(`/trips/${id}/members/${them.user.id}/owner`, 'POST', undefined, owner));
    const res = await h.app.request(jsonRequest(`/trips/${id}/leave`, 'POST', undefined, owner));
    expect(res.status).toBe(200);
  });
});

describe('concurrent edits', () => {
  it('rejects a stale update with 409 rather than overwriting', async () => {
    // Two members editing one trip is a real case; last-write-wins should be a
    // decision, not an accident (PLAN.md §8).
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await makeTrip(cookie);

    const before = (await (await h.app.request(jsonRequest(`/trips/${id}`, 'GET', undefined, cookie))).json()) as {
      trip: { updatedAt: string };
    };
    const stale = before.trip.updatedAt;

    h.setNow(new Date('2026-08-15T13:00:00.000Z'));
    const ok = await h.app.request(
      jsonRequest(`/trips/${id}`, 'PATCH', { name: 'Porto', expectedUpdatedAt: stale }, cookie),
    );
    expect(ok.status).toBe(200);

    const conflict = await h.app.request(
      jsonRequest(`/trips/${id}`, 'PATCH', { name: 'Madrid', expectedUpdatedAt: stale }, cookie),
    );
    expect(conflict.status).toBe(409);
  });

  it('rejects a patch that would invert the dates using the merged result', async () => {
    // Sending only endDate can still produce a trip that ends before it starts,
    // which per-field validation cannot see.
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const id = await makeTrip(cookie);

    const res = await h.app.request(jsonRequest(`/trips/${id}`, 'PATCH', { endDate: '2026-09-01' }, cookie));
    expect(res.status).toBe(400);
  });
});

describe('deleting a trip', () => {
  it('is owner-only', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const member = await signUp(h, 'b@example.com');
    const id = await makeTrip(owner);
    await h.app.request(jsonRequest(`/trips/${id}/invite`, 'POST', { email: 'b@example.com' }, owner));
    await h.app.request(
      jsonRequest(`/invites/${tokenFromMail(h.mailer, 'b@example.com')}/accept`, 'POST', undefined, member),
    );

    expect((await h.app.request(jsonRequest(`/trips/${id}`, 'DELETE', undefined, member))).status).toBe(403);
    expect((await h.app.request(jsonRequest(`/trips/${id}`, 'DELETE', undefined, owner))).status).toBe(200);
  });

  it('takes its membership rows with it', async () => {
    h = await createHarness();
    const owner = await signUp(h, 'a@example.com');
    const id = await makeTrip(owner);
    await h.app.request(jsonRequest(`/trips/${id}`, 'DELETE', undefined, owner));

    const res = await h.app.request(jsonRequest('/trips', 'GET', undefined, owner));
    await expect(res.json()).resolves.toEqual({ trips: [] });
  });
});
