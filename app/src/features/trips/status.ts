import { instantToLocal, type TripSummary } from '@travel/shared';

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/**
 * Today's calendar date in the **trip's** home zone, not the browser's.
 *
 * A trip that starts on the 3rd in Lisbon has not started at 21:00 on the 2nd in
 * Toronto, and the app that exists to get timezones right should not say it has.
 * A trip's own dates are bare calendar dates, so everything derived from this
 * compares days rather than instants.
 */
export function todayInTrip(trip: { homeTimezone?: string }, now: Date = new Date()): string {
  return instantToLocal(now.toISOString(), trip.homeTimezone ?? 'UTC').slice(0, 10);
}

/**
 * Whether the trip's last day is already behind the traveller.
 *
 * Exported because the trips list splits Upcoming from Past, and used to do it
 * with `new Date().toISOString().slice(0, 10)` — UTC. At 21:00 in Toronto on the
 * 2nd, a trip ending the 2nd filed itself under **Past** while its own badge, on
 * the same card, still read **Day N of N**: UTC had turned over and the trip's
 * home zone had not. Two answers to "has this ended" is one too many.
 */
export function hasEnded(
  trip: Pick<TripSummary, 'endDate'> & { homeTimezone?: string },
  now: Date = new Date(),
): boolean {
  // Both sides are zero-padded `YYYY-MM-DD`, so string order is date order.
  return todayInTrip(trip, now) > trip.endDate;
}

/**
 * Where a trip sits relative to now — the one thing worth knowing before
 * anything else on the screen, and the reason a trip opens with a header rather
 * than a title (BRAND.md §6b).
 */
export function tripStatus(
  trip: Pick<TripSummary, 'startDate' | 'endDate'> & { homeTimezone?: string },
  now: Date = new Date(),
): { text: string; tone: '' | 'live' | 'soon' } {
  const today = todayInTrip(trip, now);
  const start = dayNumber(trip.startDate);
  const end = dayNumber(trip.endDate);
  const t = dayNumber(today);

  if (hasEnded(trip, now)) return { text: 'Ended', tone: '' };
  if (t >= start) return { text: `Day ${t - start + 1} of ${end - start + 1}`, tone: 'live' };

  const away = start - t;
  if (away === 1) return { text: 'Starts tomorrow', tone: 'soon' };
  // Beyond a month out, "in 214 days" is a fact nobody is acting on today, so
  // it loses the accent and reads as ordinary metadata.
  return { text: `In ${away} days`, tone: away <= 30 ? 'soon' : '' };
}
