import { and, eq, isNull, lte } from 'drizzle-orm';
import { activities, lodging, pushSubscriptions, reminders, segments, users } from '../db/schema';
import type { Db } from '../db/client';
import type { Mailer } from '../mail/mailer';
import { GoneError, type Pusher } from './push';

/**
 * The reminder sweep (PLAN.md §4, §7).
 *
 * One instance and a file database means there is nowhere for a scheduler to
 * live but this process. That is the same *location* as budget-app's boot-time
 * `purgeExpired`, and deliberately **not** the same reliability bar: missing a
 * purge costs nothing because expired rows are rejected on use, while missing a
 * reminder costs a missed flight.
 */

/**
 * How late is too late.
 *
 * The process dies on every deploy, crash and restart, and unsent rows are
 * picked up on the next boot. That is right for a reminder five minutes late
 * and absurd for one four hours late — "your flight departs in 3 hours" arriving
 * after the plane left is worse than silence, because it is actively
 * misleading.
 */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export type SweepDeps = { db: Db; mailer: Mailer; pusher: Pusher | null };

const TABLES = { segment: segments, lodging, activity: activities } as const;

/** Does the thing this reminder is about still exist? */
async function targetExists(db: Db, kind: keyof typeof TABLES, id: string): Promise<boolean> {
  const table = TABLES[kind];
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  return rows.length > 0;
}

export type SweepResult = { sent: number; failed: number; stale: number; orphaned: number };

/**
 * One pass. Returns what it did, so the caller can log something useful and
 * tests can assert on it.
 */
export async function sweepOnce(deps: SweepDeps, now: Date = new Date()): Promise<SweepResult> {
  const { db, mailer, pusher } = deps;
  const result: SweepResult = { sent: 0, failed: 0, stale: 0, orphaned: 0 };

  const due = await db
    .select()
    .from(reminders)
    .where(
      and(
        lte(reminders.remindAt, now.toISOString()),
        isNull(reminders.claimedAt),
        isNull(reminders.sentAt),
      ),
    );

  for (const row of due) {
    /**
     * Claim before sending. `WHERE claimed_at IS NULL` makes the update itself
     * the lock: if a second pass is already running — a slow send outlasting a
     * tick, or a manual trigger — its update changes no rows and it skips.
     * Select-send-stamp duplicates every notification whose send is slow.
     */
    const claimed = await db
      .update(reminders)
      .set({ claimedAt: now.toISOString() })
      .where(and(eq(reminders.id, row.id), isNull(reminders.claimedAt)))
      .returning({ id: reminders.id });
    if (claimed.length === 0) continue;

    const fail = async (error: string) => {
      await db
        .update(reminders)
        .set({ failedAt: now.toISOString(), error })
        .where(eq(reminders.id, row.id));
    };

    if (now.getTime() - Date.parse(row.remindAt) > STALE_AFTER_MS) {
      await fail('stale');
      result.stale++;
      continue;
    }

    // The event may have been deleted since; relatedId is polymorphic and
    // cannot carry a foreign key to prevent it.
    if (!(await targetExists(db, row.relatedType, row.relatedId))) {
      await fail('target_deleted');
      result.orphaned++;
      continue;
    }

    try {
      if (row.channel === 'email') {
        const found = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
        const user = found[0];
        if (!user) throw new Error('no such user');
        await mailer.send({ to: user.email, subject: row.title, text: `${row.title} — ${row.body}` });
      } else {
        if (!pusher) throw new Error('push is not configured');
        const subs = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, row.userId));
        if (subs.length === 0) throw new Error('no push subscription');
        // Every browser this person has registered.
        for (const sub of subs) {
          try {
            await pusher.send(sub, { title: row.title, body: row.body });
          } catch (error) {
            // A dead endpoint has already been deleted by the pusher; the other
            // browsers should still get it.
            if (!(error instanceof GoneError)) throw error;
          }
        }
      }
      await db.update(reminders).set({ sentAt: now.toISOString() }).where(eq(reminders.id, row.id));
      result.sent++;
    } catch (error) {
      await fail(String((error as Error).message ?? error).slice(0, 200));
      result.failed++;
    }
  }

  return result;
}

/**
 * Runs the sweep on an interval, never overlapping itself.
 *
 * The guard is not belt-and-braces: a tick that is still working when the next
 * fires would otherwise have two passes competing, and while the claim above
 * makes that safe it also makes it pointless work.
 */
export function startSweep(deps: SweepDeps, intervalMs = 60_000): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await sweepOnce(deps);
      if (r.sent + r.failed + r.stale + r.orphaned > 0) {
        console.info(
          `Reminder sweep: ${r.sent} sent, ${r.failed} failed, ${r.stale} stale, ${r.orphaned} orphaned.`,
        );
      }
    } catch (error) {
      // A sweep that throws must not kill the interval, or one bad row stops
      // every future reminder.
      console.error('Reminder sweep failed:', error);
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => void tick(), intervalMs);
  // Do not hold the process open on its own account.
  handle.unref?.();
  void tick();
  return () => clearInterval(handle);
}
