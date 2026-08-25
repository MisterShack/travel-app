import { Hono, type Context } from 'hono';
import { nearbyRequestSchema } from '@travel/shared';
import type { Db } from '../db/client';
import type { Env } from '../env';
import { requireUser, type AuthedVars } from '../middleware/requireUser';
import { roleIn } from '../trip/membership';
import { getEntity, tripIdOf } from '../trip/timeline';
import { createDailyCap, type DailyCap } from './cap';
import { askNearby } from './grounding';

export type NearbyDeps = {
  db: Db;
  env: Env;
  now?: () => Date;
  /** Injectable so a spec can set the cap to 1 without 50 model calls. */
  cap?: DailyCap;
};

/**
 * "What's nearby" — Phase 10 (PLAN-V3 §3).
 *
 * **Pulled, never pushed.** Every one of these is a POST because it spends
 * money and asks a third party a question; none of it happens unless someone
 * taps a chip. Nothing here is called on render.
 *
 * Mounted flat (`/lodging/:id/nearby`) to sit beside the entity routes it
 * belongs to, and authorised the same way they are: entity → trip → role. An id
 * in a URL is a claim, never an authorisation.
 *
 * **Segments get no route, deliberately** — the same line Phase 8 drew for
 * Directions. An IATA code is not an address and a station's city is not the
 * station, so there is nothing here to ground a question against.
 */
export function createNearbyRoutes(deps: NearbyDeps) {
  const { db, env } = deps;
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Variables: AuthedVars }>();
  const auth = requireUser(db, env, now);
  const cap = deps.cap ?? createDailyCap(env.NEARBY_DAILY_CAP);

  /**
   * Where the question is asked *about*.
   *
   * A lodging keeps its address in `address` and an activity in `location`, and
   * the entity's own name goes in front of it: "Hotel Lutetia, 45 Boulevard
   * Raspail, Paris" identifies a place that a bare street address in a city
   * with repeated street names may not.
   */
  const placeOf = (kind: 'lodging' | 'activity', row: Record<string, unknown>): string | null => {
    const address = kind === 'lodging' ? row['address'] : row['location'];
    if (typeof address !== 'string' || address.trim() === '') return null;
    const name = typeof row['name'] === 'string' ? row['name'].trim() : '';
    return name === '' ? address.trim() : `${name}, ${address.trim()}`;
  };

  const nearbyRoute = (path: string, kind: 'lodging' | 'activity') => {
    app.post(path, auth, async (c: Context<{ Variables: AuthedVars }>) => {
      const id = c.req.param('id');
      if (id === undefined) return c.json({ error: 'not_found' }, 404);

      const tripId = await tripIdOf(db, kind, id);
      if (!tripId || !(await roleIn(db, tripId, c.get('user').id))) {
        return c.json({ error: 'not_found' }, 404);
      }

      const body = nearbyRequestSchema.safeParse(await c.req.json().catch(() => null));
      if (!body.success) {
        return c.json(
          { error: 'invalid_request', message: 'Pick one of the questions.' },
          400,
        );
      }

      /**
       * Configuration and data gates come before the cap, so neither one costs
       * the caller a question they never got to ask.
       */
      if (env.GEMINI_API_KEY === undefined) {
        return c.json(
          {
            error: 'not_configured',
            message: 'Suggestions are not available on this deployment.',
          },
          503,
        );
      }

      const row = await getEntity(db, kind, id);
      if (!row) return c.json({ error: 'not_found' }, 404);

      const place = placeOf(kind, row as Record<string, unknown>);
      if (place === null) {
        // The client hides the chips without an address; this is the server
        // saying the same thing rather than trusting that it did.
        return c.json(
          {
            error: 'no_address',
            message: 'Add an address to this event to ask what is nearby.',
          },
          400,
        );
      }

      const at = now();
      const key = c.get('user').id;
      if (!cap.consume(key, at)) {
        return c.json(
          {
            error: 'daily_cap',
            message: `That is ${env.NEARBY_DAILY_CAP} questions today. Try again tomorrow.`,
          },
          429,
        );
      }

      const result = await askNearby({
        intent: body.data.intent,
        place,
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
      });

      if (!result.ok) {
        // Logged rather than returned: the reason names the model and its own
        // error text, which is for whoever is reading the logs, not for someone
        // standing outside a hotel wanting to know where the metro is.
        console.warn(`Nearby (${kind} ${id}, ${body.data.intent}): ${result.reason}`);
        return c.json(
          {
            error: 'unavailable',
            message: 'Could not look that up just now. Try again in a moment.',
          },
          502,
        );
      }

      return c.json({ answer: result.answer, remaining: cap.remaining(key, at) });
    });
  };

  nearbyRoute('/lodging/:id/nearby', 'lodging');
  nearbyRoute('/activities/:id/nearby', 'activity');

  return app;
}
