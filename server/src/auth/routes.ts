import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  forgotInputSchema,
  loginInputSchema,
  registerInputSchema,
  resetInputSchema,
} from '@travel/shared';
import type { Db } from '../db/client';
import { authTokens, users } from '../db/schema';
import type { Mailer } from '../mail/mailer';
import type { Env } from '../env';
import { rateLimit } from '../middleware/rateLimit';
import { hashPassword, verifyPassword } from './password';
import { createSession, resolveSession, revokeSession, revokeAllSessions } from './sessions';
import { expiryFrom, generateToken, hashToken, isExpired, TOKEN_TTL } from './tokens';

export type AuthDeps = {
  db: Db;
  mailer: Mailer;
  env: Env;
  /** Injectable clock so token expiry is testable without waiting an hour. */
  now?: () => Date;
};

const tokenSchema = z.object({ token: z.string().min(1).max(500) });

function badRequest(message: string, issues?: unknown) {
  return { error: 'invalid_request' as const, message, ...(issues ? { issues } : {}) };
}

export function createAuthRoutes(deps: AuthDeps) {
  const { db, mailer, env } = deps;
  const now = deps.now ?? (() => new Date());
  const app = new Hono();

  const secureCookie = env.NODE_ENV === 'production';
  /**
   * Several origins may be allowed to talk to the API (dev server and preview
   * both, in development), but an emailed link has to name exactly one. The
   * first is the canonical one.
   */
  const linkOrigin = env.APP_ORIGIN[0] ?? 'http://localhost:5173';

  const setSessionCookie = (c: Context, token: string, expiresAt: string) => {
    setCookie(c, env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'Lax',
      path: '/',
      expires: new Date(expiresAt),
    });
  };

  /** Tight limits: these are the routes worth guessing at. */
  const strictLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, trustProxy: env.TRUST_PROXY });
  const looseLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, trustProxy: env.TRUST_PROXY });

  async function issueToken(userId: string, kind: 'verify' | 'reset'): Promise<string> {
    const token = generateToken();
    const at = now();
    await db.insert(authTokens).values({
      tokenHash: hashToken(token),
      userId,
      kind,
      expiresAt: expiryFrom(at, TOKEN_TTL[kind]),
      usedAt: null,
      createdAt: at.toISOString(),
    });
    return token;
  }

  /* -- register ---------------------------------------------------------- */

  app.post('/register', strictLimit, async (c) => {
    const body = registerInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(badRequest('Check the email and password.', body.error.issues), 400);
    }

    const { email, password } = body.data;
    const at = now();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing[0]) {
      // Registering an existing address must not confirm that it exists. Send
      // the owner a note instead, and answer exactly as for a new account.
      await mailer.send({
        to: email,
        subject: 'Someone tried to register your Trips account',
        text: 'An account already exists for this address. If this was you, sign in instead — or reset your password if you have forgotten it.',
      });
      return c.json({ ok: true, message: 'Check your email to finish signing up.' }, 201);
    }

    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: null,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
    });

    // Unlike budget-app, nothing is created alongside the account: a new user
    // has an empty trip list until they create a trip or redeem an invite
    // (PLAN.md §5). There is no "personal" trip to auto-create.

    const token = await issueToken(userId, 'verify');
    await mailer.send({
      to: email,
      subject: 'Verify your Trips account',
      text: `Confirm your address to finish signing up:\n\n${linkOrigin}/verify?token=${token}\n\nThis link expires in 24 hours.`,
    });

    return c.json({ ok: true, message: 'Check your email to finish signing up.' }, 201);
  });

  /* -- verify ------------------------------------------------------------ */

  app.post('/verify', looseLimit, async (c) => {
    const body = tokenSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('A verification token is required.'), 400);

    const at = now();
    const rows = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.tokenHash, hashToken(body.data.token)), eq(authTokens.kind, 'verify')))
      .limit(1);

    const row = rows[0];
    if (!row || row.usedAt !== null || isExpired(row.expiresAt, at) || !row.userId) {
      return c.json({ error: 'invalid_token', message: 'That link is no longer valid.' }, 400);
    }

    const userId = row.userId;
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ emailVerifiedAt: at.toISOString(), updatedAt: at.toISOString() })
        .where(eq(users.id, userId));
      await tx
        .update(authTokens)
        .set({ usedAt: at.toISOString() })
        .where(eq(authTokens.tokenHash, row.tokenHash));
    });

    // Verifying signs you in: the link proves control of the mailbox, which is
    // the same thing the password proves control of the account.
    const session = await createSession(db, userId, env.SESSION_TTL_DAYS, at);
    setSessionCookie(c, session.token, session.expiresAt);

    return c.json({ ok: true });
  });

  /* -- resend verification ----------------------------------------------- */

  app.post('/resend-verification', strictLimit, async (c) => {
    const body = forgotInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('An email address is required.'), 400);

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, body.data.email))
      .limit(1);
    const user = rows[0];

    // Same answer either way: whether an address has an unverified account is
    // not something an unauthenticated caller gets to learn.
    if (user && user.emailVerifiedAt === null) {
      const token = await issueToken(user.id, 'verify');
      await mailer.send({
        to: user.email,
        subject: 'Verify your Trips account',
        text: `Confirm your address to finish signing up:\n\n${linkOrigin}/verify?token=${token}\n\nThis link expires in 24 hours.`,
      });
    }

    return c.json({ ok: true, message: 'If that address needs verifying, a link is on its way.' });
  });

  /* -- login ------------------------------------------------------------- */

  app.post('/login', strictLimit, async (c) => {
    const body = loginInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('Enter your email and password.'), 400);

    const at = now();
    const rows = await db.select().from(users).where(eq(users.email, body.data.email)).limit(1);
    const user = rows[0];

    // The same generic failure whether the address is unknown or the password
    // is wrong, and the hash is verified either way so the timing does not
    // reveal which.
    const ok = user
      ? await verifyPassword(user.passwordHash, body.data.password)
      : await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', body.data.password);

    if (!user || !ok) {
      return c.json({ error: 'invalid_credentials', message: 'That email or password is wrong.' }, 401);
    }

    if (user.emailVerifiedAt === null) {
      return c.json(
        { error: 'unverified', message: 'Verify your email address first — check your inbox.' },
        403,
      );
    }

    const session = await createSession(db, user.id, env.SESSION_TTL_DAYS, at);
    setSessionCookie(c, session.token, session.expiresAt);

    return c.json({ ok: true, user: { id: user.id, email: user.email } });
  });

  /* -- logout ------------------------------------------------------------ */

  app.post('/logout', async (c) => {
    const token = getCookie(c, env.SESSION_COOKIE_NAME);
    if (token) await revokeSession(db, token);
    deleteCookie(c, env.SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ ok: true });
  });

  /* -- me ---------------------------------------------------------------- */

  app.get('/me', async (c) => {
    const token = getCookie(c, env.SESSION_COOKIE_NAME);
    const user = token ? await resolveSession(db, token, now()) : null;
    if (!user) return c.json({ error: 'unauthenticated' }, 401);
    return c.json({
      user: { id: user.id, email: user.email, emailVerifiedAt: user.emailVerifiedAt },
    });
  });

  /* -- forgot ------------------------------------------------------------ */

  app.post('/forgot', strictLimit, async (c) => {
    const body = forgotInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(badRequest('An email address is required.'), 400);

    const rows = await db.select().from(users).where(eq(users.email, body.data.email)).limit(1);
    const user = rows[0];

    if (user) {
      const token = await issueToken(user.id, 'reset');
      await mailer.send({
        to: user.email,
        subject: 'Reset your Trips password',
        text: `Set a new password:\n\n${linkOrigin}/reset?token=${token}\n\nThis link expires in an hour. If you did not ask for it, ignore this message.`,
      });
    }

    // Deliberately identical whether or not the address is known.
    return c.json({ ok: true, message: 'If that address has an account, a reset link is on its way.' });
  });

  /* -- reset ------------------------------------------------------------- */

  app.post('/reset', strictLimit, async (c) => {
    const body = resetInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(badRequest('A token and a new password are required.', body.error.issues), 400);
    }

    const at = now();
    const rows = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.tokenHash, hashToken(body.data.token)), eq(authTokens.kind, 'reset')))
      .limit(1);

    const row = rows[0];
    if (!row || row.usedAt !== null || isExpired(row.expiresAt, at) || !row.userId) {
      return c.json({ error: 'invalid_token', message: 'That link is no longer valid.' }, 400);
    }

    const userId = row.userId;
    const passwordHash = await hashPassword(body.data.password);

    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userRows[0];
    if (!user) return c.json({ error: 'invalid_token', message: 'That link is no longer valid.' }, 400);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          // Completing a reset proves control of the mailbox, which is what
          // verification asks for — so an unverified account becomes verified
          // here rather than being left unable to sign in. An already-verified
          // account keeps its original timestamp; this is not a re-verification.
          emailVerifiedAt: user.emailVerifiedAt ?? at.toISOString(),
          updatedAt: at.toISOString(),
        })
        .where(eq(users.id, userId));
      await tx
        .update(authTokens)
        .set({ usedAt: at.toISOString() })
        .where(eq(authTokens.tokenHash, row.tokenHash));
    });

    // Whoever changed the password keeps control; anyone signed in with the old
    // one is turned out.
    await revokeAllSessions(db, userId);

    return c.json({ ok: true, message: 'Password changed. Sign in with your new password.' });
  });

  return app;
}
