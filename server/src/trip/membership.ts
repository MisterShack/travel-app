import { and, count, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { TripInput, TripRole } from '@travel/shared';
import type { Db } from '../db/client';
import { tripMembers, trips, users } from '../db/schema';

/**
 * Trip ownership and membership (PLAN.md §4, §5).
 *
 * Unlike budget-app, registration creates nothing: a new account has an empty
 * trip list until it creates a trip or redeems an invite. There is no
 * personal/shared distinction to carry over, so "the caller's trip" is never
 * implicit — every request names one, and naming one is a claim, not an
 * authorisation.
 */

export type Role = TripRole;

/**
 * The caller's role in a trip, or `null` if they are not a member.
 *
 * This is the authorisation check, and it lives here so every route uses the
 * same one. A trip id in a request is a claim, never an authorisation — nothing
 * may read or write without going through this.
 */
export async function roleIn(db: Db, tripId: string, userId: string): Promise<Role | null> {
  const rows = await db
    .select({ role: tripMembers.role })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);

  return rows[0]?.role ?? null;
}

export type TripSummaryRow = {
  id: string;
  name: string;
  destination: string | null;
  startDate: string;
  endDate: string;
  homeTimezone: string;
  role: Role;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Every trip the caller belongs to. Never returns one they do not. */
export async function listTripsFor(db: Db, userId: string): Promise<TripSummaryRow[]> {
  const rows = await db
    .select({
      id: trips.id,
      name: trips.name,
      destination: trips.destination,
      startDate: trips.startDate,
      endDate: trips.endDate,
      homeTimezone: trips.homeTimezone,
      role: tripMembers.role,
      createdAt: trips.createdAt,
      updatedAt: trips.updatedAt,
    })
    .from(trips)
    .innerJoin(tripMembers, eq(tripMembers.tripId, trips.id))
    .where(eq(tripMembers.userId, userId));

  const counts = await db
    .select({ tripId: tripMembers.tripId, n: count() })
    .from(tripMembers)
    .groupBy(tripMembers.tripId);
  const byTrip = new Map(counts.map((c) => [c.tripId, c.n]));

  return rows
    .map((r) => ({ ...r, memberCount: byTrip.get(r.id) ?? 1 }))
    // Soonest departure first: the trip you are about to take is the one you
    // open, and past trips sink below it.
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
}

/** A new trip with the creator as its sole owner. */
export async function createTrip(
  db: Db,
  userId: string,
  input: TripInput,
  now: Date,
): Promise<string> {
  const id = `trp_${randomUUID()}`;
  const timestamp = now.toISOString();

  await db.transaction(async (tx) => {
    await tx.insert(trips).values({
      id,
      name: input.name,
      destination: input.destination ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      homeTimezone: input.homeTimezone,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    // Same transaction: a trip with no owner would violate §4's invariant, and
    // a crash between the two statements is exactly how that happens.
    await tx.insert(tripMembers).values({
      tripId: id,
      userId,
      role: 'owner',
      remindersEnabled: 'true',
      joinedAt: timestamp,
    });
  });

  return id;
}

export async function getTrip(db: Db, tripId: string) {
  const rows = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  return rows[0] ?? null;
}

export async function listMembers(db: Db, tripId: string) {
  return db
    .select({
      userId: tripMembers.userId,
      email: users.email,
      role: tripMembers.role,
      remindersEnabled: tripMembers.remindersEnabled,
      joinedAt: tripMembers.joinedAt,
    })
    .from(tripMembers)
    .innerJoin(users, eq(users.id, tripMembers.userId))
    .where(eq(tripMembers.tripId, tripId));
}

/** Promotes an existing member to owner. Owners are a set; this adds to it. */
export async function grantOwner(db: Db, tripId: string, userId: string): Promise<boolean> {
  const role = await roleIn(db, tripId, userId);
  if (!role) return false;
  await db
    .update(tripMembers)
    .set({ role: 'owner' })
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
  return true;
}

/**
 * Removes a member, refusing to remove the last owner.
 *
 * "At least one owner" is the invariant (PLAN.md §4). Enforced here rather than
 * at the route, so leaving and being removed cannot disagree about it.
 */
export async function removeMember(
  db: Db,
  tripId: string,
  userId: string,
): Promise<'removed' | 'not_a_member' | 'last_owner'> {
  const role = await roleIn(db, tripId, userId);
  if (!role) return 'not_a_member';

  if (role === 'owner') {
    const owners = await db
      .select({ userId: tripMembers.userId })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.role, 'owner')));
    if (owners.length <= 1) return 'last_owner';
  }

  await db
    .delete(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
  return 'removed';
}

/**
 * Deletes a trip and everything hanging off it.
 *
 * Every child table declares `onDelete: 'cascade'`, so members and invite
 * tokens go with it. Owner-only, checked at the route.
 */
export async function deleteTrip(db: Db, tripId: string): Promise<void> {
  await db.delete(trips).where(eq(trips.id, tripId));
}

/** Per-member reminder opt-out for one trip (PLAN.md §7 fan-out). */
export async function setRemindersEnabled(
  db: Db,
  tripId: string,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(tripMembers)
    .set({ remindersEnabled: enabled ? 'true' : 'false' })
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
}
