import { describe, expect, it } from 'vitest';
import { tripStatus } from './status';

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
