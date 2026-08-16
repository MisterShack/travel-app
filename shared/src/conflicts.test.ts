import { describe, expect, it } from 'vitest';
import { findIssues, TIGHT_CONNECTION_MINUTES } from './conflicts';
import type { TimelineItem } from './timeline';

const TRIP = { startDate: '2026-09-10', endDate: '2026-09-13', homeTimezone: 'Europe/Lisbon' };

function item(over: Partial<TimelineItem> & { id: string }): TimelineItem {
  return {
    kind: 'activity',
    tripId: 't1',
    title: 'Thing',
    subtitle: null,
    startAt: '2026-09-10T12:00:00.000Z',
    startLocal: '2026-09-10T13:00',
    startTimezone: 'Europe/Lisbon',
    startPlace: null,
    endAt: null,
    endLocal: null,
    endTimezone: null,
    endPlace: null,
    confirmationCode: null,
    notes: null,
    source: 'manual',
    ...over,
  };
}

const flight = (id: string, dep: string, arr: string, route: string) =>
  item({ id, kind: 'flight', title: `Flight ${id}`, subtitle: route, startAt: dep, endAt: arr });

/** Lodging covering the whole trip, so night checks stay quiet by default. */
const hotel = item({
  id: 'h1',
  kind: 'lodging',
  title: 'Hotel',
  startAt: '2026-09-10T12:00:00.000Z',
  endAt: '2026-09-13T09:00:00.000Z',
});

describe('overlaps', () => {
  it('flags two timed events at once', () => {
    // The case the timezone work exists for: you land at 13:00 and dinner was
    // booked for 12:30, across two zones.
    const issues = findIssues(
      [
        hotel,
        flight('f1', '2026-09-10T09:00:00.000Z', '2026-09-10T12:00:00.000Z', 'LHR → LIS'),
        item({ id: 'a1', title: 'Dinner', startAt: '2026-09-10T11:30:00.000Z', endAt: '2026-09-10T13:00:00.000Z' }),
      ],
      TRIP,
    );
    const overlap = issues.filter((i) => i.kind === 'overlap');
    expect(overlap).toHaveLength(1);
    expect(overlap[0]?.severity).toBe('conflict');
    expect(overlap[0]?.itemIds.sort()).toEqual(['a1', 'f1']);
  });

  it('never flags lodging against anything', () => {
    // A hotel spans the whole stay and overlaps every dinner. Flagging that
    // would fire on nearly every trip and train people to ignore the feature.
    const issues = findIssues(
      [hotel, item({ id: 'a1', endAt: '2026-09-10T14:00:00.000Z' })],
      TRIP,
    );
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(0);
  });

  it('does not flag events that merely touch', () => {
    const issues = findIssues(
      [
        hotel,
        item({ id: 'a1', startAt: '2026-09-10T12:00:00.000Z', endAt: '2026-09-10T13:00:00.000Z' }),
        item({ id: 'a2', startAt: '2026-09-10T13:00:00.000Z', endAt: '2026-09-10T14:00:00.000Z' }),
      ],
      TRIP,
    );
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(0);
  });

  it('ignores events with no end — an open-ended thing conflicts with nothing', () => {
    const issues = findIssues([hotel, item({ id: 'a1' }), item({ id: 'a2' })], TRIP);
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(0);
  });
});

describe('connections', () => {
  it('flags a tight turnaround', () => {
    const issues = findIssues(
      [
        hotel,
        flight('f1', '2026-09-10T09:00:00.000Z', '2026-09-10T12:00:00.000Z', 'LHR → LIS'),
        flight('f2', '2026-09-10T13:00:00.000Z', '2026-09-10T15:00:00.000Z', 'LIS → OPO'),
      ],
      TRIP,
    );
    const tight = issues.find((i) => i.kind === 'tight-connection');
    expect(tight?.message).toMatch(/60 minutes/);
    expect(TIGHT_CONNECTION_MINUTES).toBe(90);
  });

  it('stays quiet on a comfortable connection', () => {
    const issues = findIssues(
      [
        hotel,
        flight('f1', '2026-09-10T09:00:00.000Z', '2026-09-10T12:00:00.000Z', 'LHR → LIS'),
        flight('f2', '2026-09-10T16:00:00.000Z', '2026-09-10T18:00:00.000Z', 'LIS → OPO'),
      ],
      TRIP,
    );
    expect(issues.filter((i) => i.kind === 'tight-connection')).toHaveLength(0);
  });

  it('flags landing at one airport and leaving from another', () => {
    // No amount of spare time fixes this on its own, so it is flagged
    // regardless of the gap.
    const issues = findIssues(
      [
        hotel,
        flight('f1', '2026-09-10T09:00:00.000Z', '2026-09-10T12:00:00.000Z', 'LIS → LHR'),
        flight('f2', '2026-09-11T09:00:00.000Z', '2026-09-11T11:00:00.000Z', 'LGW → OPO'),
      ],
      TRIP,
    );
    const change = issues.find((i) => i.kind === 'airport-change');
    expect(change?.message).toMatch(/land at LHR .* leaves from LGW/);
  });
});

describe('unbooked nights', () => {
  it('flags a night with nowhere booked', () => {
    const issues = findIssues(
      [item({ id: 'l1', kind: 'lodging', startAt: '2026-09-10T12:00:00.000Z', endAt: '2026-09-11T09:00:00.000Z' })],
      TRIP,
    );
    const nights = issues.filter((i) => i.kind === 'unbooked-night');
    expect(nights.map((n) => n.message)).toEqual([
      'Nowhere booked for the night of 2026-09-11.',
      'Nowhere booked for the night of 2026-09-12.',
    ]);
  });

  it('counts an overnight flight as covered', () => {
    // You are not sleeping in a hotel; telling you to book one would be wrong.
    const issues = findIssues(
      [
        item({ id: 'l1', kind: 'lodging', startAt: '2026-09-10T12:00:00.000Z', endAt: '2026-09-11T09:00:00.000Z' }),
        flight('f1', '2026-09-11T20:00:00.000Z', '2026-09-12T06:00:00.000Z', 'LIS → JFK'),
        item({ id: 'l2', kind: 'lodging', startAt: '2026-09-12T14:00:00.000Z', endAt: '2026-09-13T09:00:00.000Z' }),
      ],
      TRIP,
    );
    expect(issues.filter((i) => i.kind === 'unbooked-night')).toHaveLength(0);
  });

  it('says nothing at all about an empty trip', () => {
    // A trip you have not filled in yet is not a trip with problems.
    expect(findIssues([], TRIP)).toEqual([]);
  });
});

describe('outside the trip', () => {
  it('flags an event on the wrong date', () => {
    const issues = findIssues([hotel, item({ id: 'a1', startAt: '2027-09-10T12:00:00.000Z' })], TRIP);
    expect(issues.find((i) => i.kind === 'outside-trip')?.message).toMatch(/2027-09-10/);
  });
});

describe('ordering', () => {
  it('puts impossibilities before risks', () => {
    const issues = findIssues(
      [
        hotel,
        item({ id: 'a1', startAt: '2026-09-10T12:00:00.000Z', endAt: '2026-09-10T14:00:00.000Z' }),
        item({ id: 'a2', startAt: '2026-09-10T13:00:00.000Z', endAt: '2026-09-10T15:00:00.000Z' }),
        item({ id: 'a3', startAt: '2027-01-01T12:00:00.000Z' }),
      ],
      TRIP,
    );
    expect(issues[0]?.severity).toBe('conflict');
  });
});
