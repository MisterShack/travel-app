import { instantToLocal, localToInstant } from './time';
import type { TimelineItem } from './timeline';

/**
 * Conflict and gap detection (PLAN-V3 Phase 11).
 *
 * This is the feature that falls out of the architecture rather than being
 * bolted onto it. Every event carries a correct UTC instant across zones —
 * which is the expensive thing this project paid for — so "you land at 13:00
 * but dinner is booked for 12:30" is a comparison rather than a guess. Apps
 * that are casual about timezones cannot do this, which is why most do not.
 *
 * Pure, and deliberately in `shared/`: it runs on the client over the timeline
 * already in hand, so it works with no network, costs nothing per use, and
 * needs no round trip.
 *
 * **The design constraint is false positives.** An app that cries wolf gets
 * ignored, and then it is worse than silent. Every rule below is written to
 * stay quiet unless something is genuinely wrong.
 */

export type IssueKind =
  | 'overlap'
  | 'tight-connection'
  | 'airport-change'
  | 'unbooked-night'
  | 'outside-trip';

export type Issue = {
  kind: IssueKind;
  /** `conflict` cannot be true at once; `warning` is possible but risky. */
  severity: 'conflict' | 'warning';
  message: string;
  /** Ids of the items involved, so the UI can point at them. */
  itemIds: string[];
};

/** Below this between landing and the next departure, flag it. */
export const TIGHT_CONNECTION_MINUTES = 90;

const at = (item: TimelineItem) => Date.parse(item.startAt);
const end = (item: TimelineItem) => (item.endAt ? Date.parse(item.endAt) : Date.parse(item.startAt));

/**
 * Lodging is excluded from overlap checks, deliberately.
 *
 * A hotel spans the whole stay, so it overlaps every dinner and every museum.
 * Flagging that would produce an alert on nearly every trip and teach people to
 * ignore the feature within a day. You are allowed to leave the hotel.
 */
function overlaps(items: TimelineItem[]): Issue[] {
  const timed = items.filter((i) => i.kind !== 'lodging' && i.endAt !== null);
  const issues: Issue[] = [];

  for (let a = 0; a < timed.length; a++) {
    for (let b = a + 1; b < timed.length; b++) {
      const first = timed[a]!;
      const second = timed[b]!;
      // Touching is not overlapping: a train arriving exactly as something
      // starts is tight, not impossible, and the connection rule covers it.
      if (at(second) >= end(first) || at(first) >= end(second)) continue;
      issues.push({
        kind: 'overlap',
        severity: 'conflict',
        message: `“${first.title}” and “${second.title}” overlap.`,
        itemIds: [first.id, second.id],
      });
    }
  }
  return issues;
}

/**
 * Whether two endpoints name the same place.
 *
 * Exact for airport codes, because they are exact identifiers and `LHR`/`LGW`
 * differing is the whole point of the rule.
 *
 * Deliberately loose everywhere else. A station name is free text a person
 * typed, so "Ottawa" and "Ottawa Station" are one place and only an exact
 * comparison would disagree — and this rule's standing constraint is that a
 * false positive costs more than a miss, because an app that cries wolf gets
 * ignored and is then worse than silent. Containment errs toward quiet.
 *
 * Doing this properly needs both endpoints resolved to coordinates, which is
 * Phase 9 and is not built. Until then this is a heuristic and is written to
 * fail in the harmless direction.
 */
function samePlace(a: string, b: string, exact: boolean): boolean {
  if (exact) return a === b;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === '' || y === '') return true;
  return x === y || x.includes(y) || y.includes(x);
}

/** Consecutive journeys: too little time between them, or a different place entirely. */
function connections(items: TimelineItem[]): Issue[] {
  const legs = items.filter((i) => i.kind === 'segment').sort((x, y) => at(x) - at(y));
  const issues: Issue[] = [];

  for (let i = 0; i < legs.length - 1; i++) {
    const arriving = legs[i]!;
    const departing = legs[i + 1]!;
    if (!arriving.endAt) continue;

    const gapMinutes = Math.round((at(departing) - Date.parse(arriving.endAt)) / 60_000);
    if (gapMinutes < 0) continue; // a genuine overlap; already reported

    /**
     * Comparing where you arrive against where you next leave from catches the
     * classic trap — landing at one airport and departing from another — which
     * no amount of spare time fixes on its own.
     *
     * Read from the structured endpoints, not from the subtitle. Parsing the
     * subtitle worked only while it was exactly "LHR → LIS"; adding seats to it
     * made every connection compare "LIS · 14C" against "LIS" and report a
     * change of airport that was not one.
     *
     * **Which pair of fields depends on the modes, because they are not one
     * namespace.** Phase 12 made `origin`/`destination` an IATA code for air and
     * a station *name* for everything else, so a flight into `YOW` followed by a
     * train out of `Ottawa` compared `"YOW" !== "Ottawa"` and reported a change
     * of city that was not one — reported from a real Winnipeg–Ottawa–Montreal
     * itinerary, where it fired at both ends of the return trip.
     *
     * Air against air stays on the codes, and must: `LHR` and `LGW` are both
     * "London" and a connection between them is exactly what this rule exists
     * to catch. Anything else compares `endPlace`/`startPlace`, which is the
     * airport's own city for a flight and the station name as written for a
     * train — the one form the two modes can meet in.
     */
    const bothAir = arriving.mode === 'air' && departing.mode === 'air';
    // Falls back to the raw endpoint when no place was resolved — an unknown
    // airport code has no city, and comparing something beats comparing null.
    const landsAt = bothAir ? arriving.destination : (arriving.endPlace ?? arriving.destination);
    const leavesFrom = bothAir ? departing.origin : (departing.startPlace ?? departing.origin);

    if (landsAt && leavesFrom && !samePlace(landsAt, leavesFrom, bothAir)) {
      issues.push({
        kind: 'airport-change',
        severity: 'warning',
        message: `You arrive at ${landsAt} but the next journey leaves from ${leavesFrom}.`,
        itemIds: [arriving.id, departing.id],
      });
      continue;
    }

    if (gapMinutes < TIGHT_CONNECTION_MINUTES) {
      issues.push({
        kind: 'tight-connection',
        severity: 'warning',
        message: `Only ${gapMinutes} minutes between landing and the next departure.`,
        itemIds: [arriving.id, departing.id],
      });
    }
  }
  return issues;
}

/**
 * A night inside the trip with nowhere booked.
 *
 * "Covered" is tested at 23:00 local on the night in question, which is a
 * proxy rather than a truth — but a defensible one, and far less
 * false-positive-prone than trying to reason about check-in and check-out
 * times. An overnight flight counts as covered: you are not sleeping in a
 * hotel, and telling you to book one would be wrong.
 */
function unbookedNights(
  items: TimelineItem[],
  trip: { startDate: string; endDate: string; homeTimezone: string },
): Issue[] {
  const shelters = items.filter((i) => (i.kind === 'lodging' || i.kind === 'segment') && i.endAt);
  const issues: Issue[] = [];

  const start = new Date(`${trip.startDate}T00:00:00Z`);
  const finish = new Date(`${trip.endDate}T00:00:00Z`);

  for (let d = new Date(start); d < finish; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const midnightish = Date.parse(localToInstant(`${date}T23:00`, trip.homeTimezone).instant);
    const covered = shelters.some((s) => at(s) <= midnightish && Date.parse(s.endAt!) >= midnightish);
    if (!covered) {
      issues.push({
        kind: 'unbooked-night',
        severity: 'warning',
        message: `Nowhere booked for the night of ${date}.`,
        itemIds: [],
      });
    }
  }
  return issues;
}

/** An event outside the trip's own dates — usually a year typed wrong. */
function outsideTrip(
  items: TimelineItem[],
  trip: { startDate: string; endDate: string; homeTimezone: string },
): Issue[] {
  return items.flatMap((item) => {
    const day = instantToLocal(item.startAt, item.startTimezone).slice(0, 10);
    if (day >= trip.startDate && day <= trip.endDate) return [];
    return [
      {
        kind: 'outside-trip' as const,
        severity: 'warning' as const,
        message: `“${item.title}” is on ${day}, outside the trip's dates.`,
        itemIds: [item.id],
      },
    ];
  });
}

export function findIssues(
  items: TimelineItem[],
  trip: { startDate: string; endDate: string; homeTimezone: string },
): Issue[] {
  if (items.length === 0) return [];
  return [
    ...overlaps(items),
    ...connections(items),
    ...outsideTrip(items, trip),
    ...unbookedNights(items, trip),
  ].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'conflict' ? -1 : 1));
}
