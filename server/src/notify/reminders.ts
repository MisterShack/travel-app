import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  formatTimeOfDay,
  instantToLocal,
  resolveHour12,
  zoneLabel,
  type TimeFormat,
} from '@travel/shared';
import type { Db } from '../db/client';
import { pushSubscriptions, reminders, tripMembers, users } from '../db/schema';

/**
 * Reminder generation and fan-out (PLAN.md §7).
 */

export type RelatedType = 'segment' | 'lodging' | 'activity';

/**
 * How long before an event its reminder fires.
 *
 * Settles the open question in PLAN.md §13. The numbers are the lead time each
 * event type actually needs to be useful: a journey is the one you must leave
 * for, so three hours covers travel to the airport and bag drop; a hotel
 * check-in only needs enough warning to plan the afternoon; a dinner
 * reservation needs an hour. Not user-configurable yet — a per-event override
 * is a later addition, and picking sensible defaults matters more than
 * exposing a setting nobody will open.
 */
export const DEFAULT_LEAD_MINUTES: Record<RelatedType, number> = {
  segment: 180,
  lodging: 120,
  activity: 60,
};

export type ReminderSubject = {
  tripId: string;
  relatedType: RelatedType;
  relatedId: string;
  /** UTC instant the event starts. */
  startAt: string;
  /** The zone the event is in, for rendering the time in the message. */
  timezone: string;
  /**
   * Where it happens, when that is known independently of the zone. A zone is
   * not a place: an Ottawa departure in `America/Toronto` used to read
   * "departs at 07:15 (Toronto)", which names a city the traveller is not in.
   */
  place: string | null;
  title: string;
  detail: string;
};

/**
 * The message is rendered **now** and stored, rather than composed at send
 * time. A reminder that has already gone out should read the same as when it
 * was scheduled; deriving the text later would let an edit rewrite the history
 * of what was said.
 */
function compose(
  subject: ReminderSubject,
  timeFormat: TimeFormat,
): { title: string; body: string } {
  const local = instantToLocal(subject.startAt, subject.timezone);
  /*
   * `false` is what `auto` means here. The client resolves it from the reader's
   * own device; this runs in a datacentre, whose locale is nobody's. So a
   * reminder is 24-hour unless the traveller asked for 12 by name — which is
   * also exactly what these messages said before the preference existed.
   */
  /*
   * The locale is pinned rather than left to the host. Unpinned, this reads the
   * container's default: the same reminder rendered "7:30 p.m." on a Windows
   * development machine and would have rendered something else again on the
   * Railway image, so what a traveller reads would have depended on an accident
   * of the base image. The app's copy is English (BRAND.md), so it says so.
   */
  const time = formatTimeOfDay(local, resolveHour12(timeFormat, false), 'en-US');
  const where = subject.place ?? zoneLabel(subject.timezone);
  const noun =
    subject.relatedType === 'segment' ? 'departs' : subject.relatedType === 'lodging' ? 'check-in' : 'starts';
  return {
    title: subject.title,
    body: `${noun} at ${time} (${where})${subject.detail ? ` — ${subject.detail}` : ''}`,
  };
}

/**
 * Creates one reminder per member per available channel.
 *
 * Email is the default channel and is always created; a push row is added for
 * members who have a subscription **at this moment**. Someone who enables push
 * later gets it on events created or edited after that, not retroactively —
 * editing an event regenerates its reminders, which is the escape hatch.
 *
 * Members who have muted this trip (`remindersEnabled`) get nothing, and a
 * reminder whose time has already passed is never created: the sweep would only
 * drop it as stale.
 */
export async function generateReminders(
  db: Db,
  subject: ReminderSubject,
  now: Date,
): Promise<number> {
  const lead = DEFAULT_LEAD_MINUTES[subject.relatedType];
  const remindAt = new Date(Date.parse(subject.startAt) - lead * 60_000);
  if (remindAt.getTime() <= now.getTime()) return 0;

  /*
   * The member's own time format comes back with them, because the body is
   * written per recipient: one traveller reads "departs at 7:30 PM" and another
   * on the same booking reads "departs at 19:30".
   */
  const members = await db
    .select({ userId: tripMembers.userId, timeFormat: users.timeFormat })
    .from(tripMembers)
    .innerJoin(users, eq(users.id, tripMembers.userId))
    .where(and(eq(tripMembers.tripId, subject.tripId), eq(tripMembers.remindersEnabled, 'true')));
  if (members.length === 0) return 0;

  const subscribed = new Set(
    (
      await db
        .select({ userId: pushSubscriptions.userId })
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, members.map((m) => m.userId)))
    ).map((r) => r.userId),
  );

  const rows = members.flatMap((m) => {
    /*
     * Composed inside the fan-out rather than once above it, so each row carries
     * the recipient's own wording. Still rendered *now* and stored: a reminder
     * that has already gone out should read the same as when it was scheduled,
     * so changing the preference later moves the ones not yet written, not the
     * ones already queued.
     */
    const { title, body } = compose(subject, m.timeFormat);
    const channels: ('email' | 'push')[] = subscribed.has(m.userId) ? ['email', 'push'] : ['email'];
    return channels.map((channel) => ({
      id: `rem_${randomUUID()}`,
      tripId: subject.tripId,
      userId: m.userId,
      channel,
      relatedType: subject.relatedType,
      relatedId: subject.relatedId,
      origin: 'auto' as const,
      title,
      body,
      remindAt: remindAt.toISOString(),
      claimedAt: null,
      sentAt: null,
      failedAt: null,
      error: null,
      createdAt: now.toISOString(),
    }));
  });

  await db.insert(reminders).values(rows);
  return rows.length;
}

/**
 * Drops the **pending** auto-generated reminders for an event.
 *
 * Two things deliberately survive. Custom reminders are the user's, and only
 * what the app generated is the app's to remove. Already-sent rows are a record
 * of what was actually delivered — deleting them would rewrite history, and the
 * `sentAt` stamp is the only thing that stops a resurrected row being sent
 * twice.
 */
export async function deleteAutoReminders(db: Db, relatedType: RelatedType, relatedId: string) {
  await db
    .delete(reminders)
    .where(
      and(
        eq(reminders.relatedType, relatedType),
        eq(reminders.relatedId, relatedId),
        eq(reminders.origin, 'auto'),
        isNull(reminders.sentAt),
      ),
    );
}

/**
 * Regenerates after an edit.
 *
 * Without this, editing a delayed flight leaves a reminder for the old
 * departure time and deleting a cancelled one still pings you about it — the
 * two failures most likely to make someone stop trusting the app (PLAN.md §7).
 * Already-sent reminders are left alone: they are a record of what happened.
 */
export async function regenerateReminders(db: Db, subject: ReminderSubject, now: Date) {
  await deleteAutoReminders(db, subject.relatedType, subject.relatedId);
  await generateReminders(db, subject, now);
}
