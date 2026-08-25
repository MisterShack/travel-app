import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Db } from './db/client';
import type { Env } from './env';
import type { Mailer } from './mail/mailer';
import { originGuard } from './middleware/originGuard';
import { createAuthRoutes } from './auth/routes';
import { createInviteRoutes, createTripRoutes } from './trip/routes';
import { createNotifyRoutes } from './notify/routes';
import { createImportRoutes } from './import/routes';
import { createNearbyRoutes } from './nearby/routes';
import type { InboundClient } from './import/resendInbound';
import type { Pusher } from './notify/push';

export const SERVER_VERSION = '0.0.0';

export type AppDeps = {
  db: Db;
  env: Env;
  mailer: Mailer;
  /** Null when inbound import is not configured; the webhook then no-ops. */
  inbound?: InboundClient | null;
  /** Null when VAPID is unset; imports then arrive silently. */
  pusher?: Pusher | null;
  /** Injectable clock, so token expiry is testable without waiting an hour. */
  now?: () => Date;
};

/**
 * The API, built from its dependencies rather than importing them, so tests can
 * construct one against a throwaway database and a recording mailer.
 */
export function buildApp({ db, env, mailer, inbound = null, pusher = null, now }: AppDeps) {
  const app = new Hono();

  /**
   * Sessions are cookie-based, so a state-changing request carrying an Origin
   * this server does not serve is rejected outright. Registered before the
   * routes so nothing can be reached around it.
   */
  app.use('*', originGuard(env.APP_ORIGIN));

  /**
   * Railway's healthcheck target — `healthcheckPath` on the service itself
   * since 2026-08-24, having previously come from `railway.json` (DEPLOY.md
   * §8b). Reports liveness *and* that the database opens: a server answering
   * happily while its volume is missing is exactly the failure the `/data`
   * mount gotcha produces (DEPLOY.md §2).
   */
  app.get('/health', async (c) => {
    try {
      await db.run('select 1');
      return c.json({ status: 'ok', version: SERVER_VERSION });
    } catch (error) {
      return c.json(
        { status: 'degraded', version: SERVER_VERSION, error: (error as Error).message },
        503,
      );
    }
  });

  /**
   * The API lives under `/api`, the client owns everything else.
   *
   * Without the prefix the two share a URL space and collide: the client's trip
   * page is `/trips/:id` and so is the API's, so a browser deep-linking to a
   * trip receives `401 {"error":"unauthenticated"}` as JSON instead of the app
   * shell. Found by opening the deployed shape rather than by reading it.
   *
   * `/health` deliberately stays at the root, because the service's
   * `healthcheckPath` points there. Moving it would not fail loudly: the
   * fallback below answers every unmatched GET with `index.html`, so a
   * healthcheck aimed anywhere else gets 200 and HTML and passes forever
   * (DEPLOY.md §8b).
   */
  app.route('/api/auth', createAuthRoutes({ db, mailer, env, now }));
  app.route('/api', createTripRoutes({ db, mailer, env, now }));
  app.route('/api', createInviteRoutes({ db, mailer, env, now }));
  app.route('/api', createNotifyRoutes({ db, env, now }));
  app.route('/api', createImportRoutes({ db, env, inbound, pusher, now }));
  app.route('/api', createNearbyRoutes({ db, env, now }));

  // Static file serving is registered *after* the API routes so it can never
  // shadow them, and only when STATIC_DIR is set — which is how one process
  // serves both the client and the API from one origin (DEPLOY.md §8).
  if (env.STATIC_DIR !== undefined) {
    const root = env.STATIC_DIR;
    app.use('/*', serveStatic({ root }));
    // SPA fallback: any unmatched GET renders the client shell and lets the
    // router sort it out.
    app.get('/*', serveStatic({ path: 'index.html', root }));
  }

  return app;
}
