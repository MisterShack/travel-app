import { and, eq, gt, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { authTokens, sessions, users, type UserRow } from '../db/schema';
import { expiryFrom, generateToken, hashToken, isExpired } from './tokens';

export type IssuedSession = {
  /** The raw token — returned once, to be put in the cookie. Never stored. */
  token: string;
  expiresAt: string;
};

export async function createSession(
  db: Db,
  userId: string,
  ttlDays: number,
  now: Date = new Date(),
): Promise<IssuedSession> {
  const token = generateToken();
  const expiresAt = expiryFrom(now, ttlDays * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    createdAt: now.toISOString(),
  });

  return { token, expiresAt };
}

/**
 * Resolves a raw cookie token to its user, or null. An expired row is deleted
 * on sight rather than merely ignored, so the table cannot grow forever.
 */
export async function resolveSession(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<UserRow | null> {
  const tokenHash = hashToken(token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (isExpired(row.session.expiresAt, now)) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }

  return row.user;
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/**
 * Used after a password reset: whoever changed the password keeps control, and
 * anyone signed in with the old one is turned out.
 */
export async function revokeAllSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Housekeeping for rows that can no longer do anything. Called at boot: with
 * one instance and a file database there is nowhere else for a scheduler to
 * live, and unbounded growth of dead tokens is the only real cost of skipping
 * it. Expired rows are already rejected on use, so this is hygiene, not
 * security.
 *
 * **This is not the pattern the reminder sweep should copy.** Missing a purge
 * costs nothing; missing a reminder sweep costs a missed flight. Same place to
 * run, different reliability bar — see PLAN.md §4 and §7, which spell out the
 * claim-before-send and staleness rules the sweep needs and this does not.
 */
export async function purgeExpired(
  db: Db,
  now: Date = new Date(),
): Promise<{ sessions: number; tokens: number }> {
  const cutoff = now.toISOString();
  const staleSessions = await db
    .select({ id: sessions.tokenHash })
    .from(sessions)
    .where(lt(sessions.expiresAt, cutoff));
  const staleTokens = await db
    .select({ id: authTokens.tokenHash })
    .from(authTokens)
    .where(lt(authTokens.expiresAt, cutoff));

  await db.delete(sessions).where(lt(sessions.expiresAt, cutoff));
  await db.delete(authTokens).where(lt(authTokens.expiresAt, cutoff));

  return { sessions: staleSessions.length, tokens: staleTokens.length };
}

/** Exported for tests that need to assert on a specific user's live sessions. */
export async function countSessions(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ tokenHash: sessions.tokenHash })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now.toISOString())));
  return rows.length;
}
