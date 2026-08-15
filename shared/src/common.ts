import { z } from 'zod';

/**
 * Primitives shared by the client and the server. Platform-neutral: no DOM, no
 * Node, no framework (PLAN.md §2).
 */

/** ISO-8601 UTC instant, e.g. `2026-08-15T14:30:00.000Z`. */
export const instantSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)) && v.endsWith('Z'), {
    message: 'Must be an ISO-8601 UTC instant ending in Z',
  });

/** Calendar date with no time, e.g. `2026-08-15`. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date')
  .refine((v) => {
    // Rejects 2026-02-31: the regex cannot, and Date would silently roll over.
    const [y, m, d] = v.split('-').map(Number) as [number, number, number];
    const probe = new Date(Date.UTC(y, m - 1, d));
    return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
  }, 'Not a real calendar date');

/**
 * Local wall-clock time with **no zone or offset**, e.g. `2026-08-15T14:30`.
 *
 * This is half of the timezone triple in PLAN.md §4 and is never stored alone —
 * it always travels with an IANA zone, and the UTC instant is derived from the
 * pair. It exists because a ticket is sold in local time: if a country changes
 * its DST rules between booking and travel, the wall-clock time on the ticket
 * is still right and a pre-computed instant is not.
 */
export const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Must be a YYYY-MM-DDTHH:mm local time')
  .refine((v) => {
    const [date, time] = v.split('T') as [string, string];
    if (!dateOnlySchema.safeParse(date).success) return false;
    const [h, min] = time.split(':').map(Number) as [number, number];
    return h >= 0 && h <= 23 && min >= 0 && min <= 59;
  }, 'Not a real local date and time');

/**
 * An IANA timezone name, e.g. `Europe/London`.
 *
 * Validated by asking the platform's own database rather than matching a
 * pattern or shipping a list: `Intl.DateTimeFormat` throws `RangeError` for a
 * zone it does not know, which is exactly the question being asked. A regex
 * would accept `Europe/Nowhere`, and the whole point of PLAN.md §4 is that this
 * value is load-bearing for every conversion.
 */
export function isValidTimeZone(tz: string): boolean {
  if (tz === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .refine(isValidTimeZone, 'Not a recognised IANA timezone name, e.g. Europe/London');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Not a valid email address')
  .max(254, 'Email address is too long');

/**
 * Long enough to matter, short enough to be typed on a phone. No composition
 * rules: length is what makes a password hard to guess, and rules mostly make
 * people write them down.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'That is longer than any password needs to be');
