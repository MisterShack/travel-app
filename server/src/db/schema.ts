import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Timestamps are ISO-8601 UTC strings, matching the convention `shared/` uses.
 * No `Date` objects anywhere in stored values.
 *
 * Phase 2 covers auth and trips. The timeline entities (flights, lodging,
 * activities), booking imports and reminders arrive in Phases 3–5; see
 * PLAN.md §3 for their shape, including the local+zone+instant triple every
 * event time carries.
 */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    /** Stored lower-cased; uniqueness must not depend on how it was typed. */
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    /** Null until the emailed verification link is used. */
    emailVerifiedAt: text('email_verified_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('users_email_idx').on(table.email)],
);

export type UserRow = typeof users.$inferSelect;

/**
 * Only the SHA-256 of the session token is stored, so a database leak cannot
 * be replayed as a live session.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

/**
 * Email-verification, password-reset and trip-invite tokens. Hashed at rest,
 * single-use (`usedAt`), and short-lived — a leaked database must not yield a
 * working password-reset link or a live invite.
 */
export const authTokens = sqliteTable(
  'auth_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    /**
     * **Nullable, because an invite exists before its recipient does.**
     * `verify` and `reset` always carry one; `invite` never does — it is bound
     * to `email` instead. Anything reading this must narrow.
     */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['verify', 'reset', 'invite'] }).notNull(),
    /** Set on `invite` only: the trip being joined. */
    tripId: text('trip_id').references(() => trips.id, { onDelete: 'cascade' }),
    /**
     * Set on `invite` only. Redemption compares it against the **verified**
     * address of the account redeeming, so an intercepted or forwarded link
     * cannot be used to join from a different account (PLAN.md §4).
     */
    email: text('email'),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('auth_tokens_user_idx').on(table.userId),
    index('auth_tokens_trip_idx').on(table.tripId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Trips and membership                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A trip is what flights, lodging and activities belong to — not a user
 * (PLAN.md §4). Unlike budget-app's ledgers there is no personal/shared
 * distinction: every trip starts with exactly one owner and can gain members.
 */
export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  destination: text('destination'),
  /**
   * Trip-level bounds, anchored to `homeTimezone`. For list sort and
   * upcoming/past bucketing only — never for event arithmetic.
   */
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  /** IANA name; the default display zone for the trip. */
  homeTimezone: text('home_timezone').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type TripRow = typeof trips.$inferSelect;

/**
 * Who can see a trip, and what they may do with it.
 *
 * Owners are a **set of at least one** (PLAN.md §4). Leaving is refused while
 * you are the last owner, so a trip cannot become ownerless; granting ownership
 * needs no consent because it only adds power, and the recipient can leave.
 */
export const tripMembers = sqliteTable(
  'trip_members',
  {
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    /**
     * Per-member opt-out for this trip's reminders. Lives here rather than on
     * the user because muting one trip must not mute the next one (PLAN.md §7).
     */
    remindersEnabled: text('reminders_enabled', { enum: ['true', 'false'] })
      .notNull()
      .default('true'),
    joinedAt: text('joined_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tripId, table.userId] }),
    index('trip_members_user_idx').on(table.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Timeline entities                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Every event time is three columns: the local wall-clock string, the IANA zone
 * it is expressed in, and the derived UTC instant (PLAN.md §4).
 *
 * Local+zone is the source of truth — it is what the ticket says, and DST rules
 * change between booking and travel. The `*_at` instant is a derived index,
 * recomputed whenever the local time or the zone changes, and it is what the
 * merged timeline sorts on. A flight departing in one zone and landing in
 * another cannot be ordered any other way.
 *
 * Three tables rather than one polymorphic `events` table, because each type
 * has meaningfully different required fields and a shared table would make most
 * of them nullable.
 */

export const flights = sqliteTable(
  'flights',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    airline: text('airline').notNull(),
    flightNumber: text('flight_number').notNull(),
    confirmationCode: text('confirmation_code'),

    departureAirport: text('departure_airport').notNull(),
    departureLocal: text('departure_local').notNull(),
    departureTimezone: text('departure_timezone').notNull(),
    departureAt: text('departure_at').notNull(),

    arrivalAirport: text('arrival_airport').notNull(),
    arrivalLocal: text('arrival_local').notNull(),
    arrivalTimezone: text('arrival_timezone').notNull(),
    arrivalAt: text('arrival_at').notNull(),

    seat: text('seat'),
    notes: text('notes'),
    source: text('source', { enum: ['manual', 'import'] })
      .notNull()
      .default('manual'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('flights_trip_idx').on(table.tripId, table.departureAt)],
);

export const lodging = sqliteTable(
  'lodging',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),

    checkInLocal: text('check_in_local').notNull(),
    checkInTimezone: text('check_in_timezone').notNull(),
    checkInAt: text('check_in_at').notNull(),

    checkOutLocal: text('check_out_local').notNull(),
    checkOutTimezone: text('check_out_timezone').notNull(),
    checkOutAt: text('check_out_at').notNull(),

    confirmationCode: text('confirmation_code'),
    notes: text('notes'),
    source: text('source', { enum: ['manual', 'import'] })
      .notNull()
      .default('manual'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('lodging_trip_idx').on(table.tripId, table.checkInAt)],
);

export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['restaurant', 'attraction', 'transport', 'other'] }).notNull(),
    name: text('name').notNull(),
    location: text('location'),

    startLocal: text('start_local').notNull(),
    startTimezone: text('start_timezone').notNull(),
    startAt: text('start_at').notNull(),

    /** Optional: plenty of activities have a start and no meaningful end. */
    endLocal: text('end_local'),
    endTimezone: text('end_timezone'),
    endAt: text('end_at'),

    confirmationCode: text('confirmation_code'),
    notes: text('notes'),
    source: text('source', { enum: ['manual', 'import'] })
      .notNull()
      .default('manual'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('activities_trip_idx').on(table.tripId, table.startAt)],
);

export type FlightRow = typeof flights.$inferSelect;
export type LodgingRow = typeof lodging.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;
