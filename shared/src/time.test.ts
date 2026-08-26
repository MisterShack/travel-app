import { describe, expect, it } from 'vitest';
import {
  formatCalendarDate,
  instantToLocal,
  localToInstant,
  minutesBetween,
  zoneAbbreviation,
} from './time';

describe('localToInstant', () => {
  it('converts a plain winter time', () => {
    expect(localToInstant('2026-01-15T09:00', 'Europe/London').instant).toBe(
      '2026-01-15T09:00:00.000Z',
    );
  });

  it('applies summer time', () => {
    // BST is UTC+1.
    expect(localToInstant('2026-07-15T09:00', 'Europe/London').instant).toBe(
      '2026-07-15T08:00:00.000Z',
    );
  });

  it('handles a zone behind UTC', () => {
    // PDT is UTC-7 in July.
    expect(localToInstant('2026-07-15T09:00', 'America/Los_Angeles').instant).toBe(
      '2026-07-15T16:00:00.000Z',
    );
  });

  it('handles a half-hour offset', () => {
    // IST is UTC+5:30 year-round.
    expect(localToInstant('2026-07-15T09:00', 'Asia/Kolkata').instant).toBe(
      '2026-07-15T03:30:00.000Z',
    );
  });

  it('handles a zone that crosses the date line', () => {
    expect(localToInstant('2026-07-15T09:00', 'Pacific/Auckland').instant).toBe(
      '2026-07-14T21:00:00.000Z',
    );
  });
});

describe('DST boundaries', () => {
  it('reports a spring-forward gap and moves past it', () => {
    // On 2026-03-29 Europe/London jumps 01:00 -> 02:00. 01:30 never happens.
    const result = localToInstant('2026-03-29T01:30', 'Europe/London');
    expect(result.anomaly).toBe('gap');
    // The instant chosen renders as a real time on the far side of the jump.
    expect(instantToLocal(result.instant, 'Europe/London')).toBe('2026-03-29T02:30');
  });

  it('reports a fall-back ambiguity and picks the earlier occurrence', () => {
    // On 2026-10-25 Europe/London falls back 02:00 -> 01:00, so 01:30 happens
    // twice: once at 00:30Z (BST) and again at 01:30Z (GMT).
    const result = localToInstant('2026-10-25T01:30', 'Europe/London');
    expect(result.anomaly).toBe('ambiguous');
    expect(result.instant).toBe('2026-10-25T00:30:00.000Z');
    // Either way it must render back as the time that was asked for.
    expect(instantToLocal(result.instant, 'Europe/London')).toBe('2026-10-25T01:30');
  });

  it('handles a southern-hemisphere transition, not just London', () => {
    // Pacific/Auckland springs forward on 2026-09-27 at 02:00 -> 03:00.
    const gap = localToInstant('2026-09-27T02:30', 'Pacific/Auckland');
    expect(gap.anomaly).toBe('gap');
    expect(instantToLocal(gap.instant, 'Pacific/Auckland')).toBe('2026-09-27T03:30');

    // And falls back on 2026-04-05 at 03:00 -> 02:00, so 02:30 happens twice.
    const dup = localToInstant('2026-04-05T02:30', 'Pacific/Auckland');
    expect(dup.anomaly).toBe('ambiguous');
    expect(instantToLocal(dup.instant, 'Pacific/Auckland')).toBe('2026-04-05T02:30');
  });

  it('handles a zone that abolished DST entirely', () => {
    // Sao Paulo dropped DST in 2019; a February evening is unremarkable now
    // and would have been a transition a decade ago.
    expect(localToInstant('2026-02-15T23:30', 'America/Sao_Paulo').anomaly).toBeUndefined();
  });

  it('leaves ordinary times unflagged', () => {
    expect(localToInstant('2026-06-01T12:00', 'Europe/London').anomaly).toBeUndefined();
  });
});

describe('round-tripping', () => {
  const cases: [string, string][] = [
    ['2026-01-15T09:00', 'Europe/London'],
    ['2026-07-15T23:45', 'America/New_York'],
    ['2026-07-15T00:00', 'Asia/Kolkata'],
    ['2026-12-31T23:59', 'Pacific/Auckland'],
    ['2026-03-01T06:30', 'America/Sao_Paulo'],
  ];

  it.each(cases)('%s in %s survives a round trip', (local, zone) => {
    const { instant } = localToInstant(local, zone);
    expect(instantToLocal(instant, zone)).toBe(local);
  });
});

describe('cross-zone arithmetic', () => {
  it('computes a flight that lands earlier than it departs by the clock', () => {
    // LHR 10:00 BST -> JFK 13:00 EDT is an 8-hour flight, not minus three.
    const dep = localToInstant('2026-07-15T10:00', 'Europe/London').instant;
    const arr = localToInstant('2026-07-15T13:00', 'America/New_York').instant;
    expect(minutesBetween(dep, arr)).toBe(480);
    // And the arrival sorts after the departure, which a bare local string
    // would get backwards — the whole reason for PLAN.md §4's rule.
    expect(arr > dep).toBe(true);
  });

  it('computes an overnight eastbound flight', () => {
    const dep = localToInstant('2026-07-15T21:00', 'America/New_York').instant;
    const arr = localToInstant('2026-07-16T09:00', 'Europe/London').instant;
    expect(minutesBetween(dep, arr)).toBe(420);
  });
});

describe('zoneAbbreviation', () => {
  it('labels a summer and a winter instant differently', () => {
    const summer = zoneAbbreviation('2026-07-15T12:00:00.000Z', 'Europe/London');
    const winter = zoneAbbreviation('2026-01-15T12:00:00.000Z', 'Europe/London');
    expect(summer).not.toBe(winter);
  });
});

describe('formatCalendarDate', () => {
  // Numeric parts in `en-CA`, which renders them as `YYYY-MM-DD`. Month *names*
  // move with the platform's ICU version — `en-GB` says both "Sep" and "Sept"
  // depending on the build — and what is under test here is the date arithmetic,
  // not the CLDR data underneath it.
  const DMY = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;

  it('renders the date it was given', () => {
    expect(formatCalendarDate('2026-09-03', DMY, 'en-CA')).toBe('2026-09-03');
  });

  it('renders the first of a month, where an off-by-one crosses into another month', () => {
    expect(formatCalendarDate('2026-09-01', DMY, 'en-CA')).toBe('2026-09-01');
  });

  it('renders new year, where an off-by-one crosses into another year', () => {
    expect(formatCalendarDate('2026-01-01', DMY, 'en-CA')).toBe('2026-01-01');
  });

  /**
   * The guarantee that makes this safe to share. A calendar date has no zone to
   * be rendered in, so the caller does not get to supply one — and Kiritimati at
   * UTC+14 is precisely the zone that broke the noon-UTC workaround this
   * replaced, with Midway at UTC-11 the other end of the range.
   */
  it('ignores a caller-supplied timeZone rather than merging it', () => {
    expect(
      formatCalendarDate('2026-09-03', { ...DMY, timeZone: 'Pacific/Kiritimati' }, 'en-CA'),
    ).toBe('2026-09-03');
    expect(formatCalendarDate('2026-09-03', { ...DMY, timeZone: 'Pacific/Midway' }, 'en-CA')).toBe(
      '2026-09-03',
    );
  });

  it('carries the weekday through, which the timeline day heading asks for', () => {
    expect(formatCalendarDate('2026-09-03', { weekday: 'long' }, 'en-CA')).toBe('Thursday');
  });

  it('rejects anything that is not a bare calendar date', () => {
    expect(() => formatCalendarDate('2026-09-03T10:00', DMY)).toThrow(RangeError);
    expect(() => formatCalendarDate('2026-9-3', DMY)).toThrow(RangeError);
    expect(() => formatCalendarDate('not a date', DMY)).toThrow(RangeError);
  });
});
