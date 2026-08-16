import { instantToLocal, type TripSummary } from '@travel/shared';

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/**
 * Where a trip sits relative to now — the one thing worth knowing before
 * anything else on the screen, and the reason a trip opens with a header rather
 * than a title (BRAND.md §6b).
 *
 * "Today" is resolved in the **trip's** home zone, not the browser's. A trip
 * that starts on the 3rd in Lisbon has not started at 21:00 on the 2nd in
 * Toronto, and the app that exists to get timezones right should not say it
 * has. Its own dates are bare calendar dates, so both sides of the comparison
 * are days rather than instants.
 */
export function tripStatus(
  trip: Pick<TripSummary, 'startDate' | 'endDate'> & { homeTimezone?: string },
  now: Date = new Date(),
): { text: string; tone: '' | 'live' | 'soon' } {
  const today = instantToLocal(now.toISOString(), trip.homeTimezone ?? 'UTC').slice(0, 10);
  const start = dayNumber(trip.startDate);
  const end = dayNumber(trip.endDate);
  const t = dayNumber(today);

  if (t > end) return { text: 'Ended', tone: '' };
  if (t >= start) return { text: `Day ${t - start + 1} of ${end - start + 1}`, tone: 'live' };

  const away = start - t;
  if (away === 1) return { text: 'Starts tomorrow', tone: 'soon' };
  // Beyond a month out, "in 214 days" is a fact nobody is acting on today, so
  // it loses the accent and reads as ordinary metadata.
  return { text: `In ${away} days`, tone: away <= 30 ? 'soon' : '' };
}
