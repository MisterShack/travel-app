/**
 * A per-user daily cap on questions that cost money (PLAN-V3 §3).
 *
 * Registration is open, so the exposure this bounds is *someone else* spending
 * the allowance, not David spending it — the same argument that put a cap on
 * booking import, and the reason the phase asked for that pattern rather than a
 * new one.
 *
 * It is the pattern that is reused, not the mechanism, and the two differ for
 * stated reasons:
 *
 * - **Not the import's row count.** That counts rows in `booking_imports`,
 *   which exist anyway. This phase persists nothing yet — the cache is held
 *   behind the retention question in ROADMAP §4 — so counting that way would
 *   mean adding a table purely to count, and the first thing this phase is
 *   allowed to store should be decided by that gate rather than by a limiter.
 * - **Not `rateLimit` middleware.** A middleware charges the request before the
 *   handler runs, so a member tapping a chip on an event with no address, or
 *   hitting a Gemini outage, would burn a day's allowance on questions that
 *   never reached the model. This is consumed at the call site instead, so what
 *   is counted is what is actually spent.
 *
 * Held in memory, like `rateLimit` and for the same reason: one instance, by
 * design (PLAN.md §4). It resets on deploy, which means a determined abuser
 * gets a fresh allowance whenever a release lands. That is a real limit and an
 * acceptable one at this scale — it bounds sustained cost, not a burst — and if
 * this ever runs on more than one instance it becomes a shared store rather
 * than a bigger number.
 */
export type DailyCap = {
  /** Charges one use to `key`. False when the allowance is already spent. */
  consume: (key: string, at: Date) => boolean;
  /** Uses left today, without charging one — for the message the user sees. */
  remaining: (key: string, at: Date) => number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function createDailyCap(max: number, windowMs: number = DAY_MS): DailyCap {
  const windows = new Map<string, { count: number; resetAt: number }>();

  /** The live window for `key`, discarding an expired one. */
  const windowFor = (key: string, at: Date) => {
    const now = at.getTime();

    // Opportunistic sweep, as in `rateLimit`: the map holds only live windows.
    if (windows.size > 5_000) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    }

    const existing = windows.get(key);
    if (existing && existing.resetAt > now) return existing;
    const fresh = { count: 0, resetAt: now + windowMs };
    windows.set(key, fresh);
    return fresh;
  };

  return {
    consume: (key, at) => {
      const window = windowFor(key, at);
      if (window.count >= max) return false;
      window.count++;
      return true;
    },
    remaining: (key, at) => Math.max(0, max - windowFor(key, at).count),
  };
}
