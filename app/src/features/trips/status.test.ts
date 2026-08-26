import { describe, expect, it } from 'vitest';
import { hasEnded, todayInTrip, tripStatus } from './status';

const trip = { startDate: '2026-09-10', endDate: '2026-09-18', homeTimezone: 'Europe/Lisbon' };

describe('tripStatus', () => {
  it('counts down before the trip, and counts days during it', () => {
    expect(tripStatus(trip, new Date('2026-09-01T12:00:00Z'))).toEqual({
      text: 'In 9 days',
      tone: 'soon',
    });
    expect(tripStatus(trip, new Date('2026-09-09T12:00:00Z')).text).toBe('Starts tomorrow');
    expect(tripStatus(trip, new Date('2026-09-10T12:00:00Z'))).toEqual({
      text: 'Day 1 of 9',
      tone: 'live',
    });
    expect(tripStatus(trip, new Date('2026-09-18T12:00:00Z')).text).toBe('Day 9 of 9');
    expect(tripStatus(trip, new Date('2026-09-19T12:00:00Z'))).toEqual({ text: 'Ended', tone: '' });
  });

  it('resolves "today" in the trip\'s zone, not the browser\'s', () => {
    /*
     * 03:00 UTC on the 10th is still the 9th in Toronto and already the 10th in
     * Lisbon. A trip starting on the 10th in Lisbon has started; the same trip
     * anchored to Toronto has not. Getting this from the browser would make the
     * header disagree with the timeline directly below it.
     */
    const at = new Date('2026-09-10T03:00:00Z');
    expect(tripStatus(trip, at).text).toBe('Day 1 of 9');
    expect(tripStatus({ ...trip, homeTimezone: 'America/Toronto' }, at).text).toBe(
      'Starts tomorrow',
    );
  });

  it('drops the accent for a trip too far out to act on', () => {
    expect(tripStatus(trip, new Date('2026-01-01T12:00:00Z')).tone).toBe('');
  });
});

describe('hasEnded', () => {
  /**
   * The defect this exists to prevent. The trips list split Upcoming from Past
   * on `new Date().toISOString().slice(0, 10)` — UTC — while the badge on the
   * card asked the trip's own zone. At 21:00 in Toronto on the last day, UTC has
   * already turned over: the card read "Day 9 of 9" from underneath a **Past**
   * heading.
   */
  it('agrees with the badge on the last evening of a trip', () => {
    const toronto = { ...trip, homeTimezone: 'America/Toronto' };
    // 01:00 UTC on the 19th is 21:00 on the 18th in Toronto — the last day.
    const at = new Date('2026-09-19T01:00:00Z');

    expect(hasEnded(toronto, at)).toBe(false);
    expect(tripStatus(toronto, at).text).toBe('Day 9 of 9');
    // And the UTC answer, which is what made the two disagree.
    expect(at.toISOString().slice(0, 10) > toronto.endDate).toBe(true);
  });

  it('ends the trip once the last day is over in the trip\'s own zone', () => {
    const toronto = { ...trip, homeTimezone: 'America/Toronto' };
    const at = new Date('2026-09-19T13:00:00Z'); // 09:00 on the 19th in Toronto
    expect(hasEnded(toronto, at)).toBe(true);
    expect(tripStatus(toronto, at).text).toBe('Ended');
  });

  it('is false on every day of the trip, including the first and last', () => {
    // Lisbon is UTC+1 in September, so these are 01:30 on the 10th and 23:30 on
    // the 18th *there* — the first and last local days, not the UTC ones.
    expect(hasEnded(trip, new Date('2026-09-10T00:30:00Z'))).toBe(false);
    expect(hasEnded(trip, new Date('2026-09-18T22:30:00Z'))).toBe(false);
    // And half an hour later it is the 19th in Lisbon, so it has.
    expect(hasEnded(trip, new Date('2026-09-18T23:30:00Z'))).toBe(true);
  });
});

describe('todayInTrip', () => {
  it('reads the date from the trip\'s zone', () => {
    const at = new Date('2026-09-10T03:00:00Z');
    expect(todayInTrip({ homeTimezone: 'Europe/Lisbon' }, at)).toBe('2026-09-10');
    expect(todayInTrip({ homeTimezone: 'America/Toronto' }, at)).toBe('2026-09-09');
  });

  it('falls back to UTC when a trip has no home zone', () => {
    expect(todayInTrip({}, new Date('2026-09-10T03:00:00Z'))).toBe('2026-09-10');
  });
});
