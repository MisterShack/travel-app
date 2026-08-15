import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { authTokens, tripMembers, trips, users } from '../db/schema';
import { expiryFrom, generateToken, hashToken, isExpired, TOKEN_TTL } from '../auth/tokens';

/**
 * Invitations (PLAN.md §5).
 *
 * An invite is an `auth_tokens` row with `kind: 'invite'`: hashed at rest,
 * single-use, expiring. It carries no `userId`, because the person invited may
 * not have an account yet — it is bound to an **email address** instead, and
 * redemption checks that address against the *verified* address of whoever is
 * redeeming. That is what stops a forwarded or intercepted link being used to
 * join from a different account, and it means an invite can never be a way
 * around email verification.
 */

export type AcceptResult =
  | { ok: true; tripId: string }
  | { ok: false; reason: 'invalid' | 'unverified' | 'wrong_account' | 'already_member' };

export async function createInvite(
  db: Db,
  tripId: string,
  email: string,
  now: Date,
): Promise<{ token: string; expiresAt: string }> {
  const token = generateToken();
  const expiresAt = expiryFrom(now, TOKEN_TTL.invite);

  await db.insert(authTokens).values({
    tokenHash: hashToken(token),
    userId: null,
    kind: 'invite',
    tripId,
    email,
    expiresAt,
    usedAt: null,
    createdAt: now.toISOString(),
  });

  return { token, expiresAt };
}

/** Pending invites for a trip — unused and unexpired. */
export async function listInvites(db: Db, tripId: string, now: Date) {
  const rows = await db
    .select({
      tokenHash: authTokens.tokenHash,
      email: authTokens.email,
      expiresAt: authTokens.expiresAt,
      createdAt: authTokens.createdAt,
    })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.kind, 'invite'),
        eq(authTokens.tripId, tripId),
        isNull(authTokens.usedAt),
      ),
    );

  // The hash is the handle used to revoke. The token itself was only ever in
  // the email — it is not recoverable here, which is the point of hashing.
  return rows
    .filter((r) => !isExpired(r.expiresAt, now))
    .map((r) => ({ id: r.tokenHash, email: r.email, expiresAt: r.expiresAt, createdAt: r.createdAt }));
}

/**
 * Revokes a pending invite. Without this, an address typed wrong stays a live
 * key to the trip for the full seven-day TTL.
 */
export async function revokeInvite(db: Db, tripId: string, id: string): Promise<boolean> {
  const rows = await db
    .select({ tokenHash: authTokens.tokenHash })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.kind, 'invite'),
        eq(authTokens.tripId, tripId),
        eq(authTokens.tokenHash, id),
      ),
    )
    .limit(1);

  if (!rows[0]) return false;
  await db.delete(authTokens).where(eq(authTokens.tokenHash, rows[0].tokenHash));
  return true;
}

/**
 * Redeem an invite as an authenticated user.
 *
 * Deliberately a separate, explicit step rather than a side effect of
 * `/register` or `/verify`. Those routes keep their existing semantics, so
 * there is no window where a half-finished signup holds partial membership,
 * and no new way to end up verified without going through verification.
 *
 * Not nested under `/trips/:id` either: the redeemer is not a member yet, so a
 * trip-scoped route would collide with the membership check every other trip
 * route depends on (PLAN.md §5).
 */
export async function acceptInvite(
  db: Db,
  token: string,
  userId: string,
  now: Date,
): Promise<AcceptResult> {
  const rows = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.kind, 'invite')))
    .limit(1);

  const invite = rows[0];
  if (!invite || invite.usedAt !== null || isExpired(invite.expiresAt, now)) {
    return { ok: false, reason: 'invalid' };
  }
  if (!invite.tripId || !invite.email) return { ok: false, reason: 'invalid' };

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) return { ok: false, reason: 'invalid' };

  // An unverified account has not proved it controls the mailbox, so accepting
  // here would let an invite substitute for verification.
  if (user.emailVerifiedAt === null) return { ok: false, reason: 'unverified' };

  // Bound to the address it was sent to. A forwarded link joins nothing.
  if (user.email !== invite.email) return { ok: false, reason: 'wrong_account' };

  const existing = await db
    .select({ userId: tripMembers.userId })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, invite.tripId), eq(tripMembers.userId, userId)))
    .limit(1);
  if (existing[0]) return { ok: false, reason: 'already_member' };

  const tripId = invite.tripId;
  const timestamp = now.toISOString();

  await db.transaction(async (tx) => {
    await tx.insert(tripMembers).values({
      tripId,
      userId,
      role: 'member',
      remindersEnabled: 'true',
      joinedAt: timestamp,
    });
    // Marked used on acceptance, not on click: an abandoned signup must not
    // burn the invite.
    await tx
      .update(authTokens)
      .set({ usedAt: timestamp })
      .where(eq(authTokens.tokenHash, invite.tokenHash));
  });

  return { ok: true, tripId };
}

/**
 * What an invite is for, without requiring authentication.
 *
 * The landing page needs to say *which trip* you have been invited to before
 * you can sign in. It deliberately reveals only the trip's name and the invited
 * address — never whether that address already has an account, which is a
 * disclosure `/register` and `/forgot` both go out of their way to avoid.
 */
export async function describeInvite(db: Db, token: string, now: Date) {
  const rows = await db
    .select({
      email: authTokens.email,
      usedAt: authTokens.usedAt,
      expiresAt: authTokens.expiresAt,
      tripName: trips.name,
      destination: trips.destination,
    })
    .from(authTokens)
    .innerJoin(trips, eq(trips.id, authTokens.tripId))
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.kind, 'invite')))
    .limit(1);

  const row = rows[0];
  if (!row || row.usedAt !== null || isExpired(row.expiresAt, now)) return null;
  return { email: row.email, trip: row.tripName, destination: row.destination };
}
