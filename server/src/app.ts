import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Env } from './env';

export const SERVER_VERSION = '0.0.0';

export type AppDeps = {
  env: Env;
};

/**
 * The API, built from its dependencies rather than importing them, so tests can
 * construct one without a database, a mailer or a network.
 */
export function buildApp({ env }: AppDeps) {
  const app = new Hono();

  /**
   * Railway's healthcheck target (`railway.json`). It deliberately reports only
   * liveness — once the database lands in Phase 2 this also checks that the
   * connection opens, because a server that answers while its volume is missing
   * is exactly the failure the `/data` mount gotcha produces (PLAN.md §9).
   */
  app.get('/health', (c) => c.json({ status: 'ok', version: SERVER_VERSION }));

  // Static file serving is registered *after* the API routes so it can never
  // shadow them, and only when STATIC_DIR is set — which is how one process
  // serves both the client and the API from one origin (PLAN.md §9).
  if (env.STATIC_DIR !== undefined) {
    const root = env.STATIC_DIR;
    app.use('/*', serveStatic({ root }));
    // SPA fallback: any unmatched GET renders the client shell and lets the
    // router sort it out.
    app.get('/*', serveStatic({ path: 'index.html', root }));
  }

  return app;
}
