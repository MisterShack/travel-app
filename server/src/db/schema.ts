import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Timestamps are ISO-8601 UTC strings, matching the convention `shared/` uses.
 * No `Date` objects anywhere in stored values.
 *
 * Phase 2 covers auth and trips. The timeline entities (segments, lodging,
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

    /*
     * Display preferences live on the account rather than the device, so they
     * follow the person between their phone and their laptop. Both default to
     * following the device, which is what the app did before they existed —
     * every row that already exists is therefore correct with the default, and
     * migration 0008 adds no data, only columns.
     */
    timeFormat: text('time_format', { enum: ['auto', '12', '24'] })
      .notNull()
      .default('auto'),
    theme: text('theme', { enum: ['system', 'light', 'dark'] })
      .notNull()
      .default('system'),

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
 * A trip is what segments, lodging and activities belong to — not a user
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

export const segments = sqliteTable(
  'segments',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    /**
     * How this segment carries you (PLAN-V3 §3a).
     *
     * This table was `flights`. A train has everything a flight has — origin,
     * destination, departure, arrival — and only that table modelled the shape,
     * so a rail journey landed as a generic activity and its destination was
     * discarded. Most travel apps are US-built and flight-first; in Canada and
     * Europe that is simply wrong.
     */
    mode: text('mode', { enum: ['air', 'rail', 'coach', 'ferry'] })
      .notNull()
      .default('air'),
    /** The airline, the railway, the ferry operator. */
    carrier: text('carrier').notNull(),
    /** The flight number, the train number, the sailing. */
    service: text('service').notNull(),
    confirmationCode: text('confirmation_code'),

    /** An IATA code for air; a station or port name for everything else. */
    origin: text('origin').notNull(),
    departureLocal: text('departure_local').notNull(),
    departureTimezone: text('departure_timezone').notNull(),
    departureAt: text('departure_at').notNull(),

    destination: text('destination').notNull(),
    arrivalLocal: text('arrival_local').notNull(),
    arrivalTimezone: text('arrival_timezone').notNull(),
    arrivalAt: text('arrival_at').notNull(),

    /**
     * JSON `[{ "name": string, "seat": string }]` — everyone on this segment.
     *
     * Replaced a single `seat` column, which could hold a family booking only
     * by discarding all but one of them. JSON rather than a join table: a
     * passenger has no identity outside its segment, is never queried across
     * segments, and a trip has tens of rows.
     */
    passengers: text('passengers'),
    notes: text('notes'),
    source: text('source', { enum: ['manual', 'import'] })
      .notNull()
      .default('manual'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('segments_trip_idx').on(table.tripId, table.departureAt)],
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

export type SegmentRow = typeof segments.$inferSelect;
export type LodgingRow = typeof lodging.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A browser's push endpoint. One row per browser, not per user — the same
 * person on a phone and a laptop has two.
 */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Unique: re-subscribing must update this row, not add a second one. */
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (table) => [index('push_subscriptions_user_idx').on(table.userId)],
);

/**
 * One reminder per **recipient per channel** (PLAN.md §7).
 *
 * A trip has several members, so a reminder without a recipient cannot be
 * delivered or recorded, and a single `sentAt` cannot represent "sent to two of
 * four members". Fanning out at creation time makes each delivery its own row
 * with its own outcome.
 */
export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel', { enum: ['push', 'email'] }).notNull(),

    /**
     * Polymorphic pointer, so it cannot carry a foreign key. `auto` rows are
     * regenerated when the event is edited and deleted with it; the sweep also
     * skips any whose target has gone (PLAN.md §7).
     */
    relatedType: text('related_type', { enum: ['segment', 'lodging', 'activity'] }).notNull(),
    relatedId: text('related_id').notNull(),
    origin: text('origin', { enum: ['auto', 'custom'] }).notNull(),

    /** What the notification says. Rendered at creation, so a later edit to the
     *  event cannot make an already-sent reminder retroactively wrong. */
    title: text('title').notNull(),
    body: text('body').notNull(),

    remindAt: text('remind_at').notNull(),
    /**
     * Claimed before sending, so an overlapping sweep tick cannot select the
     * same row twice. Select-send-stamp duplicates every notification whose
     * send outlasts one tick.
     */
    claimedAt: text('claimed_at'),
    sentAt: text('sent_at'),
    failedAt: text('failed_at'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('reminders_due_idx').on(table.remindAt, table.claimedAt),
    index('reminders_related_idx').on(table.relatedType, table.relatedId),
    index('reminders_user_idx').on(table.userId),
  ],
);

export type ReminderRow = typeof reminders.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Booking import (Resend inbound, PLAN.md §6)                                 */
/* -------------------------------------------------------------------------- */

/**
 * One forwarded booking confirmation.
 *
 * **No part of the raw email is stored here** (PLAN.md §4). The row records
 * that an import happened and what was extracted; the source is fetched from
 * Resend on demand at review time, within their 30-day retention.
 */
export const bookingImports = sqliteTable(
  'booking_imports',
  {
    id: text('id').primaryKey(),
    /**
     * Resolved from the sender at ingest. Without it an unmatched import
     * belongs to nobody and there is no principled answer to who may read it —
     * which on a multi-user app is a way to leak one person's itinerary to
     * everyone.
     */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null until the import is matched to a trip. */
    tripId: text('trip_id').references(() => trips.id, { onDelete: 'cascade' }),

    /** Unique: this is the idempotency key for the provider's webhook retries. */
    resendMessageId: text('resend_message_id').notNull().unique(),
    fromAddress: text('from_address').notNull(),
    subject: text('subject').notNull(),
    receivedAt: text('received_at').notNull(),

    status: text('status', {
      enum: ['pending', 'needs_review', 'applied', 'rejected', 'failed'],
    }).notNull(),
    extractedType: text('extracted_type', { enum: ['segment', 'lodging', 'activity'] }),
    /** JSON of the parse result, shown on the review screen. Never the email. */
    extractedFields: text('extracted_fields'),
    /** How it was read, so a bad parser run can be told from a bad email. */
    parsedBy: text('parsed_by', { enum: ['heuristic', 'llm', 'none'] }),
    /**
     * JSON array of the flight indices already added, for a booking with more
     * than one leg.
     *
     * A return trip is one email and two timeline rows. Without this the import
     * would either vanish from the queue after the first leg was added — losing
     * the second — or stay forever with no way to tell which legs were done.
     */
    appliedSegments: text('applied_segments'),
    errorMessage: text('error_message'),

    processedAt: text('processed_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('booking_imports_user_idx').on(table.userId, table.status),
    index('booking_imports_trip_idx').on(table.tripId),
  ],
);

export type BookingImportRow = typeof bookingImports.$inferSelect;
