import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Db } from '../db/client';
import type { UserRow } from '../db/schema';
import type { Env } from '../env';
import { resolveSession } from '../auth/sessions';

export type AuthedVars = { user: UserRow };

/**
 * Resolves the session cookie to a user or rejects with 401.
 *
 * Every authenticated route goes through this rather than reading the cookie
 * itself, so there is exactly one place that decides what "signed in" means.
 */
export function requireUser(db: Db, env: Env, now: () => Date = () => new Date()) {
  return createMiddleware<{ Variables: AuthedVars }>(async (c, next) => {
    const token = getCookie(c, env.SESSION_COOKIE_NAME);
    const user = token ? await resolveSession(db, token, now()) : null;
    if (!user) {
      return c.json({ error: 'unauthenticated', message: 'Sign in first.' }, 401);
    }
    c.set('user', user);
    await next();
    return undefined;
  });
}
