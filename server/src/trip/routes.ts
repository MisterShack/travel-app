import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import {
  activityInputSchema,
  flightInputSchema,
  inviteInputSchema,
  lodgingInputSchema,
  tripInputSchema,
  tripPatchSchema,
} from '@travel/shared';
import type { Db } from '../db/client';
import { trips } from '../db/schema';
import type { Env } from '../env';
import type { Mailer } from '../mail/mailer';
import { rateLimit } from '../middleware/rateLimit';
import { requireUser, type AuthedVars } from '../middleware/requireUser';
import {
  createTrip,
  deleteTrip,
  getTrip,
  grantOwner,
  listMembers,
  listTripsFor,
  removeMember,
  roleIn,
} from './membership';
import { acceptInvite, createInvite, describeInvite, listInvites, revokeInvite } from './invites';
import {
  createActivity,
  createFlight,
  createLodging,
  deleteEntity,
  getTimeline,
  timeAnomalies,
  tripIdOf,
  updateActivity,
  updateFlight,
  updateLodging,
  type EntityKind,
} from './timeline';

export type TripDeps = {
  db: Db;
  mailer: Mailer;
  env: Env;
  now?: () => Date;
};

function badRequest(message: string, issues?: unknown) {
  return { error: 'invalid_request' as const, message, ...(issues ? { issues } : {}) };
}

/** Attaches DST warnings to a response only when there are any. */
function warn(warnings: string[]) {
  return warnings.length > 0 ? { warnings } : {};
}

/**
 * Trip routes (PLAN.md §10).
 *
 * Every one of these resolves the caller's role through `roleIn` before reading
 * or writing. A trip id in a request is a claim, never an authorisation.
 *
 * Role split (PLAN.md §5): a **member** may read the trip and — from Phase 3 —
 * create, edit and delete its timeline entities, because this is a family trip
 * planner rather than a permissions system. An **owner** may additionally
 * invite, revoke invites, manage membership and delete the trip.
 */
export function createTripRoutes(deps: TripDeps) {
  const { db, mailer, env } = deps;
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Variables: AuthedVars }>();
  const auth = requireUser(db, env, now);
  const linkOrigin = env.APP_ORIGIN[0] ?? 'http://localhost:5173';
  const inviteLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, trustProxy: env.TRUST_PROXY });

  /* -- list / create ----------------------------------------------------- */

  app.get('/trips', auth, async (c) => {
    return c.json({ trips: await listTripsFor(db, c.get('user').id) });
  });

  app.post('/trips', auth, async (c) => {
    const body = tripInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('Check the trip details.', body.error.issues), 400);

    const id = await createTrip(db, c.get('user').id, body.data, now());
    return c.json({ ok: true, id }, 201);
  });

  /* -- read / update / delete -------------------------------------------- */

  app.get('/trips/:id', auth, async (c) => {
    const tripId = c.req.param('id');
    const role = await roleIn(db, tripId, c.get('user').id);
    // 404 rather than 403 for a non-member: whether a trip id exists is not
    // something a stranger gets to learn.
    if (!role) return c.json({ error: 'not_found' }, 404);

    const trip = await getTrip(db, tripId);
    if (!trip) return c.json({ error: 'not_found' }, 404);

    return c.json({ trip: { ...trip, role }, members: await listMembers(db, tripId) });
  });

  app.patch('/trips/:id', auth, async (c) => {
    const tripId = c.req.param('id');
    const role = await roleIn(db, tripId, c.get('user').id);
    if (!role) return c.json({ error: 'not_found' }, 404);

    const body = tripPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('Check the trip details.', body.error.issues), 400);

    const trip = await getTrip(db, tripId);
    if (!trip) return c.json({ error: 'not_found' }, 404);

    const { expectedUpdatedAt, ...patch } = body.data;
    /**
     * Optimistic concurrency (PLAN.md §8). Two members editing one trip is a
     * real case, and last-write-wins should be a decision rather than something
     * arrived at by accident. A client that sends no expectation gets the old
     * behaviour, which is why the field is optional rather than required.
     */
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== trip.updatedAt) {
      return c.json(
        {
          error: 'conflict',
          message: 'Someone else changed this trip. Reload and try again.',
          currentUpdatedAt: trip.updatedAt,
        },
        409,
      );
    }

    // A patch that would invert the dates has to be checked against the merged
    // result, not the submitted fields — sending only `endDate` can still
    // produce a trip that ends before it starts.
    const merged = { startDate: trip.startDate, endDate: trip.endDate, ...patch };
    if (merged.endDate < merged.startDate) {
      return c.json(badRequest('The trip cannot end before it starts.'), 400);
    }

    const at = now().toISOString();
    await db
      .update(trips)
      .set({ ...patch, updatedAt: at })
      .where(eq(trips.id, tripId));

    return c.json({ ok: true, updatedAt: at });
  });

  app.delete('/trips/:id', auth, async (c) => {
    const tripId = c.req.param('id');
    const role = await roleIn(db, tripId, c.get('user').id);
    if (!role) return c.json({ error: 'not_found' }, 404);
    if (role !== 'owner') {
      return c.json({ error: 'forbidden', message: 'Only an owner can delete a trip.' }, 403);
    }

    await deleteTrip(db, tripId);
    return c.json({ ok: true });
  });

  /* -- members ----------------------------------------------------------- */

  app.get('/trips/:id/members', auth, async (c) => {
    const tripId = c.req.param('id');
    if (!(await roleIn(db, tripId, c.get('user').id))) return c.json({ error: 'not_found' }, 404);
    return c.json({ members: await listMembers(db, tripId) });
  });

  app.delete('/trips/:id/members/:userId', auth, async (c) => {
    const tripId = c.req.param('id');
    const role = await roleIn(db, tripId, c.get('user').id);
    if (!role) return c.json({ error: 'not_found' }, 404);
    if (role !== 'owner') {
      return c.json({ error: 'forbidden', message: 'Only an owner can remove members.' }, 403);
    }

    const result = await removeMember(db, tripId, c.req.param('userId'));
    if (result === 'not_a_member') return c.json({ error: 'not_found' }, 404);
    if (result === 'last_owner') {
      return c.json(
        {
          error: 'last_owner',
          message: 'A trip needs at least one owner. Grant ownership to someone else first.',
        },
        409,
      );
    }
    return c.json({ ok: true });
  });

  app.post('/trips/:id/members/:userId/owner', auth, async (c) => {
    const tripId = c.req.param('id');
    const role = await roleIn(db, tripId, c.get('user').id);
    if (!role) return c.json({ error: 'not_found' }, 404);
    if (role !== 'owner') {
      return c.json({ error: 'forbidden', message: 'Only an owner can grant ownership.' }, 403);
    }

    const granted = await grantOwner(db, tripId, c.req.param('userId'));
    if (!granted) return c.json({ error: 'not_found', message: 'That person is not a member.' }, 404);
    return c.json({ ok: true });
  });

  app.post('/trips/:id/leave', auth, async (c) => {
    const tripId = c.req.param('id');
    const userId = c.get('user').id;
    if (!(await roleIn(db, tripId, userId))) return c.json({ error: 'not_found' }, 404);

    // Same module as removal, so leaving and being removed cannot disagree
    // about the last-owner rule (PLAN.md §4).
    const result = await removeMember(db, tripId, userId);
    if (result === 'last_owner') {
      return c.json(
        {
          error: 'last_owner',
          message: 'You are the only owner. Grant ownership to someone else, or delete the trip.',
        },
        409,
      );
    }
    return c.json({ ok: true });
  });

  /* -- invites ----------------------------------------------------------- */

  app.post('/trips/:id/invite', auth, inviteLimit, async (c) => {
    const tripId = c.req.param('id');
    const role = await roleIn(db, tripId, c.get('user').id);
    if (!role) return c.json({ error: 'not_found' }, 404);
    if (role !== 'owner') {
      return c.json({ error: 'forbidden', message: 'Only an owner can invite people.' }, 403);
    }

    const body = inviteInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('Enter a valid email address.'), 400);

    const trip = await getTrip(db, tripId);
    if (!trip) return c.json({ error: 'not_found' }, 404);

    const { token } = await createInvite(db, tripId, body.data.email, now());
    await mailer.send({
      to: body.data.email,
      subject: `You have been invited to ${trip.name}`,
      text: `${c.get('user').email} invited you to the trip "${trip.name}".\n\nJoin it here:\n\n${linkOrigin}/invite?token=${token}\n\nThis link expires in 7 days and can only be used by this email address.`,
    });

    return c.json({ ok: true, message: 'Invitation sent.' }, 201);
  });

  app.get('/trips/:id/invites', auth, async (c) => {
    const tripId = c.req.param('id');
    const role = await roleIn(db, tripId, c.get('user').id);
    if (!role) return c.json({ error: 'not_found' }, 404);
    if (role !== 'owner') return c.json({ error: 'forbidden' }, 403);
    return c.json({ invites: await listInvites(db, tripId, now()) });
  });

  app.delete('/trips/:id/invites/:inviteId', auth, async (c) => {
    const tripId = c.req.param('id');
    const role = await roleIn(db, tripId, c.get('user').id);
    if (!role) return c.json({ error: 'not_found' }, 404);
    if (role !== 'owner') return c.json({ error: 'forbidden' }, 403);

    const revoked = await revokeInvite(db, tripId, c.req.param('inviteId'));
    if (!revoked) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

  /* -- timeline ---------------------------------------------------------- */

  app.get('/trips/:id/timeline', auth, async (c) => {
    const tripId = c.req.param('id');
    if (!(await roleIn(db, tripId, c.get('user').id))) return c.json({ error: 'not_found' }, 404);
    return c.json({ items: await getTimeline(db, tripId) });
  });

  /**
   * Creating and editing timeline entities is open to any **member**, not just
   * owners: this is a family trip planner, and requiring an owner to enter every
   * hotel would make sharing pointless (PLAN.md §5).
   */
  app.post('/trips/:id/flights', auth, async (c) => {
    const tripId = c.req.param('id');
    if (!(await roleIn(db, tripId, c.get('user').id))) return c.json({ error: 'not_found' }, 404);

    const body = flightInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('Check the flight details.', body.error.issues), 400);

    const id = await createFlight(db, tripId, body.data, now());
    return c.json({ ok: true, id, ...warn(timeAnomalies({ departure: body.data.departure, arrival: body.data.arrival })) }, 201);
  });

  app.post('/trips/:id/lodging', auth, async (c) => {
    const tripId = c.req.param('id');
    if (!(await roleIn(db, tripId, c.get('user').id))) return c.json({ error: 'not_found' }, 404);

    const body = lodgingInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('Check the lodging details.', body.error.issues), 400);

    const id = await createLodging(db, tripId, body.data, now());
    return c.json({ ok: true, id, ...warn(timeAnomalies({ checkIn: body.data.checkIn, checkOut: body.data.checkOut })) }, 201);
  });

  app.post('/trips/:id/activities', auth, async (c) => {
    const tripId = c.req.param('id');
    if (!(await roleIn(db, tripId, c.get('user').id))) return c.json({ error: 'not_found' }, 404);

    const body = activityInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('Check the activity details.', body.error.issues), 400);

    const id = await createActivity(db, tripId, body.data, now());
    return c.json({ ok: true, id, ...warn(timeAnomalies({ start: body.data.start, end: body.data.end })) }, 201);
  });

  /**
   * The entity routes are flat (`/flights/:id`), so authorisation resolves
   * entity → trip → role. An id in the URL is a claim, never an authorisation.
   *
   * The three kinds share this shape but not their schemas, so the parse and
   * the update are dispatched together in one switch — that keeps each branch
   * fully typed rather than casting a union through the update functions.
   */
  const entityRoute = (path: string, kind: EntityKind) => {
    /** Resolves the id and the caller's access, or the response to send back. */
    const authorise = async (c: Context<{ Variables: AuthedVars }>) => {
      const id = c.req.param('id');
      if (id === undefined) return { error: c.json({ error: 'not_found' }, 404) };
      const tripId = await tripIdOf(db, kind, id);
      if (!tripId || !(await roleIn(db, tripId, c.get('user').id))) {
        return { error: c.json({ error: 'not_found' }, 404) };
      }
      return { id, tripId };
    };

    app.patch(path, auth, async (c) => {
      const found = await authorise(c);
      if ('error' in found) return found.error;

      const at = now();
      const raw = await c.req.json().catch(() => null);

      switch (kind) {
        case 'flight': {
          const body = flightInputSchema.safeParse(raw);
          if (!body.success) return c.json(badRequest('Check the flight details.', body.error.issues), 400);
          await updateFlight(db, found.id, body.data, at);
          return c.json({ ok: true, ...warn(timeAnomalies({ departure: body.data.departure, arrival: body.data.arrival })) });
        }
        case 'lodging': {
          const body = lodgingInputSchema.safeParse(raw);
          if (!body.success) return c.json(badRequest('Check the lodging details.', body.error.issues), 400);
          await updateLodging(db, found.id, body.data, at);
          return c.json({ ok: true, ...warn(timeAnomalies({ checkIn: body.data.checkIn, checkOut: body.data.checkOut })) });
        }
        case 'activity': {
          const body = activityInputSchema.safeParse(raw);
          if (!body.success) return c.json(badRequest('Check the activity details.', body.error.issues), 400);
          await updateActivity(db, found.id, body.data, at);
          return c.json({ ok: true, ...warn(timeAnomalies({ start: body.data.start, end: body.data.end })) });
        }
      }
    });

    app.delete(path, auth, async (c) => {
      const found = await authorise(c);
      if ('error' in found) return found.error;
      await deleteEntity(db, kind, found.id, found.tripId);
      return c.json({ ok: true });
    });
  };

  entityRoute('/flights/:id', 'flight');
  entityRoute('/lodging/:id', 'lodging');
  entityRoute('/activities/:id', 'activity');

  return app;
}

/**
 * Invite redemption, deliberately **not** nested under `/trips/:id`.
 *
 * The redeemer is not a member yet, so a trip-scoped route would be rejected by
 * the very membership check every other trip route depends on (PLAN.md §5).
 */
export function createInviteRoutes(deps: TripDeps) {
  const { db, env } = deps;
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Variables: AuthedVars }>();
  const auth = requireUser(db, env, now);

  /**
   * Unauthenticated on purpose: the landing page has to say which trip you have
   * been invited to before you can sign in. Reveals only the trip name and the
   * invited address — never whether that address already has an account.
   */
  app.get('/invites/:token', async (c) => {
    const invite = await describeInvite(db, c.req.param('token'), now());
    if (!invite) return c.json({ error: 'invalid_token', message: 'That invitation is no longer valid.' }, 404);
    return c.json({ invite });
  });

  app.post('/invites/:token/accept', auth, async (c) => {
    const result = await acceptInvite(db, c.req.param('token'), c.get('user').id, now());
    if (result.ok) return c.json({ ok: true, tripId: result.tripId });

    const status = result.reason === 'already_member' ? 409 : result.reason === 'invalid' ? 404 : 403;
    const message = {
      invalid: 'That invitation is no longer valid.',
      unverified: 'Verify your email address before joining a trip.',
      wrong_account: 'That invitation was sent to a different address. Sign in as that account.',
      already_member: 'You are already a member of this trip.',
    }[result.reason];

    return c.json({ error: result.reason, message }, status);
  });

  return app;
}
