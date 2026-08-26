import { z } from 'zod';

/**
 * Account-level display preferences.
 *
 * These are stored on the **account**, not the device, which is the whole point
 * of them: someone who reads 12-hour time reads it on their phone and on their
 * laptop, and someone who needs a particular theme should not have to find the
 * setting again on every machine they sign in from. The cost is that they
 * cannot be honoured until `/me` has answered — see `app/src/theme.ts` for how
 * the client covers that gap without a flash of the wrong palette.
 *
 * Deliberately narrow. ROADMAP.md §5 records per-event reminder overrides being
 * deferred on the reasoning that sensible defaults matter more than a setting
 * nobody opens, and that reasoning applies here too: both of these default to
 * "follow the device", so the person who never opens the screen still gets the
 * right answer.
 */

/**
 * How a time of day is written.
 *
 * `auto` is the default and has no answer of its own — it means "whatever this
 * reader's device says". Note that **today every user sees 24-hour** regardless
 * of locale, because `instantToLocal` renders `HH:mm` and nothing has ever
 * asked: `auto` is therefore a visible change for anyone on a 12-hour device,
 * and the right one.
 */
export const timeFormats = ['auto', '12', '24'] as const;
export const timeFormatSchema = z.enum(timeFormats);
export type TimeFormat = z.infer<typeof timeFormatSchema>;

/**
 * Which palette to paint.
 *
 * `system` follows `prefers-color-scheme`, which is what the app did
 * unconditionally before this existed and is still the default.
 */
export const themes = ['system', 'light', 'dark'] as const;
export const themeSchema = z.enum(themes);
export type Theme = z.infer<typeof themeSchema>;

export const preferencesSchema = z.object({
  timeFormat: timeFormatSchema,
  theme: themeSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;

/**
 * What every account starts with, and what a client falls back to before `/me`
 * has answered or when it never will because there is no network.
 */
export const DEFAULT_PREFERENCES: Preferences = { timeFormat: 'auto', theme: 'system' };

/**
 * A change may carry either field or both, but not neither — an empty body is
 * a caller bug, and answering `200` to it would hide the bug rather than the
 * request.
 */
export const preferencesPatchSchema = preferencesSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change.' });
export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;

/**
 * Whether to write times as 12-hour.
 *
 * `auto` has no answer of its own, so the caller supplies what the device says.
 * The client reads that from `Intl` (`deviceUses12Hour`); the **server passes
 * `false`**, because a reminder email is composed on a machine in a datacentre
 * and its locale is not the traveller's. That makes 24-hour the honest reading
 * of `auto` for anything the server writes, and it is also exactly what those
 * messages said before this preference existed.
 */
export function resolveHour12(preference: TimeFormat, deviceUses12Hour: boolean): boolean {
  if (preference === '12') return true;
  if (preference === '24') return false;
  return deviceUses12Hour;
}
