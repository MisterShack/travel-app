import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { pushSubscriptions, tripMembers } from '../db/schema';
import type { Env } from '../env';
import { requireUser, type AuthedVars } from '../middleware/requireUser';
import { roleIn } from '../trip/membership';

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
});

export function createNotifyRoutes(deps: { db: Db; env: Env; now?: () => Date }) {
  const { db, env } = deps;
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Variables: AuthedVars }>();
  const auth = requireUser(db, env, now);

  /**
   * The VAPID public key, so the client can subscribe. Public by definition —
   * it ships in the page and identifies the server to the push service; only
   * the private half is a secret. Unauthenticated so the app can read it before
   * asking for notification permission.
   */
  app.get('/push/key', (c) =>
    c.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null, enabled: env.VAPID_PUBLIC_KEY !== undefined }),
  );

  app.post('/push/subscribe', auth, async (c) => {
    const body = subscribeSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid_request', message: 'Bad subscription.' }, 400);

    const at = now().toISOString();
    const existing = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, body.data.endpoint))
      .limit(1);

    /**
     * Endpoints are unique, so re-subscribing updates rather than duplicating.
     * The same browser re-registers on every service-worker update; inserting
     * blindly would mean one person receiving the same reminder five times.
     * The row is also re-pointed at the current user, since a shared device can
     * produce the same endpoint for a different account.
     */
    if (existing[0]) {
      await db
        .update(pushSubscriptions)
        .set({
          userId: c.get('user').id,
          p256dh: body.data.keys.p256dh,
          auth: body.data.keys.auth,
          lastSeenAt: at,
        })
        .where(eq(pushSubscriptions.id, existing[0].id));
      return c.json({ ok: true, updated: true });
    }

    await db.insert(pushSubscriptions).values({
      id: `psb_${randomUUID()}`,
      userId: c.get('user').id,
      endpoint: body.data.endpoint,
      p256dh: body.data.keys.p256dh,
      auth: body.data.keys.auth,
      createdAt: at,
      lastSeenAt: at,
    });
    return c.json({ ok: true }, 201);
  });

  app.post('/push/unsubscribe', auth, async (c) => {
    const body = z
      .object({ endpoint: z.string().max(1000) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid_request' }, 400);

    // Scoped to the caller: an endpoint is guessable enough that unsubscribing
    // someone else's browser should not be possible.
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, body.data.endpoint),
          eq(pushSubscriptions.userId, c.get('user').id),
        ),
      );
    return c.json({ ok: true });
  });

  /** Whether this browser is registered, for the settings UI. */
  app.get('/push/status', auth, async (c) => {
    const rows = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, c.get('user').id));
    return c.json({ endpoints: rows.map((r) => r.endpoint) });
  });

  /**
   * Per-member mute for one trip. Lives on the membership rather than the user
   * because muting one trip must not mute the next one (PLAN.md §7).
   */
  app.post('/trips/:id/reminders', auth, async (c) => {
    const tripId = c.req.param('id');
    const userId = c.get('user').id;
    if (!(await roleIn(db, tripId, userId))) return c.json({ error: 'not_found' }, 404);

    const body = z.object({ enabled: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid_request' }, 400);

    await db
      .update(tripMembers)
      .set({ remindersEnabled: body.data.enabled ? 'true' : 'false' })
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
    return c.json({ ok: true, enabled: body.data.enabled });
  });

  return app;
}
