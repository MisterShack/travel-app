import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  preferencesPatchSchema,
  preferencesSchema,
  resolveHour12,
} from './prefs';
import { formatTimeOfDay } from './time';

describe('resolveHour12', () => {
  it('honours an explicit choice whatever the device says', () => {
    expect(resolveHour12('12', false)).toBe(true);
    expect(resolveHour12('24', true)).toBe(false);
  });

  /**
   * The whole point of `auto`: it has no answer of its own. The client supplies
   * the device's; the server supplies `false`, because a reminder is composed in
   * a datacentre whose locale is nobody's.
   */
  it('defers to the caller for auto', () => {
    expect(resolveHour12('auto', true)).toBe(true);
    expect(resolveHour12('auto', false)).toBe(false);
  });
});

describe('the defaults', () => {
  it('follow the device on both axes, so an unopened screen is still right', () => {
    expect(DEFAULT_PREFERENCES).toEqual({ timeFormat: 'auto', theme: 'system' });
    expect(preferencesSchema.safeParse(DEFAULT_PREFERENCES).success).toBe(true);
  });

  it('resolve to what the app did before the preference existed', () => {
    // 24-hour, which is what `instantToLocal` has always rendered.
    expect(formatTimeOfDay('2026-09-10T19:30', resolveHour12('auto', false))).toBe('19:30');
  });
});

describe('preferencesPatchSchema', () => {
  it('accepts one field alone, because the screen changes one at a time', () => {
    expect(preferencesPatchSchema.safeParse({ theme: 'dark' }).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({ timeFormat: '12' }).success).toBe(true);
  });

  it('accepts both together', () => {
    expect(preferencesPatchSchema.safeParse({ theme: 'light', timeFormat: '24' }).success).toBe(
      true,
    );
  });

  /** An empty body is a caller bug; answering 200 would hide it. */
  it('refuses a patch that changes nothing', () => {
    expect(preferencesPatchSchema.safeParse({}).success).toBe(false);
  });

  it('refuses a value outside the enum', () => {
    expect(preferencesPatchSchema.safeParse({ theme: 'solarized' }).success).toBe(false);
    expect(preferencesPatchSchema.safeParse({ timeFormat: '48' }).success).toBe(false);
  });

  /**
   * The server writes whatever survives validation straight onto the user row,
   * so anything else in the body must not come with it.
   */
  it('drops fields that are not preferences', () => {
    const parsed = preferencesPatchSchema.parse({ theme: 'dark', email: 'attacker@example.com' });
    expect(parsed).toEqual({ theme: 'dark' });
  });
});
