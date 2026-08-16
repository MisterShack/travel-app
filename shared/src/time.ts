/**
 * The timezone triple (PLAN.md §4).
 *
 * An event is stored as local wall-clock time + IANA zone + derived UTC
 * instant. Local+zone is the source of truth — it is what the ticket says, and
 * DST rules change between booking and travel. The instant is a derived index
 * for sorting and comparison, recomputed whenever the local time or zone
 * changes.
 *
 * Everything here is built on `Intl`, which is available in both the browser
 * and Node and carries the platform's own tzdata. No dependency, and nothing
 * platform-specific — `shared/` stays neutral (PLAN.md §2).
 */

/**
 * What UTC offset the given zone is at, at a given instant, in milliseconds.
 *
 * Works by asking `Intl` what wall-clock time that instant shows in the zone,
 * reading it back as if it were UTC, and taking the difference. `hourCycle:
 * 'h23'` rather than `hour12: false`, which can render midnight as hour 24.
 */
function offsetMsAt(instant: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(instant))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }

  const asIfUtc = Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    Number(parts['hour']),
    Number(parts['minute']),
    Number(parts['second']),
  );

  return asIfUtc - instant;
}

export type LocalToInstantResult = {
  /** ISO-8601 UTC instant. */
  instant: string;
  /**
   * `gap` — the wall-clock time does not exist (spring forward); the result is
   * shifted forward past the discontinuity, so 02:30 on such a night becomes
   * 03:30 in practice.
   * `ambiguous` — it occurs twice (fall back); the *earlier* occurrence is
   * chosen, which is the one a traveller reading a schedule means.
   */
  anomaly?: 'gap' | 'ambiguous';
};

const DAY_MS = 86_400_000;

/**
 * Converts `YYYY-MM-DDTHH:mm` in an IANA zone to a UTC instant.
 *
 * The offset depends on the instant we are trying to find, which is circular,
 * so this samples the zone's offset a day either side of the target. Away from
 * a transition both samples agree and there is exactly one answer. Across one
 * they differ, giving two candidate instants — and the honest way to choose
 * between them is to convert each *back* and keep whichever actually renders as
 * the wall-clock time that was asked for.
 *
 * That validation is what makes the two anomalies fall out rather than being
 * guessed at:
 *
 * - **Both candidates valid** — the time occurs twice (fall back). The earlier
 *   is returned. Choosing silently is defensible; choosing *without saying so*
 *   is not, which is why the caller is told.
 * - **Neither valid** — the time does not exist (spring forward). The result
 *   shifts forward past the jump, matching what a traveller with an 02:30
 *   booking on that night actually experiences.
 *
 * Sampling at the naive instant alone is not enough and was the first version's
 * bug: on a fall-back night the naive reading already sits past the transition,
 * so both passes agree on the *later* offset and the earlier occurrence is
 * never even considered.
 */
export function localToInstant(local: string, timeZone: string): LocalToInstantResult {
  const naive = Date.parse(`${local}:00Z`);
  if (Number.isNaN(naive)) throw new RangeError(`Not a local date-time: ${local}`);

  const offsetBefore = offsetMsAt(naive - DAY_MS, timeZone);
  const offsetAfter = offsetMsAt(naive + DAY_MS, timeZone);

  const candidates = [...new Set([naive - offsetBefore, naive - offsetAfter])].sort((a, b) => a - b);
  const valid = candidates.filter((c) => instantToLocal(new Date(c).toISOString(), timeZone) === local);

  if (valid.length === 1) {
    return { instant: new Date(valid[0]!).toISOString() };
  }

  if (valid.length > 1) {
    return { instant: new Date(valid[0]!).toISOString(), anomaly: 'ambiguous' };
  }

  // No instant renders as the requested wall-clock time: it is inside a gap.
  // Using the pre-transition offset lands past the jump rather than before it.
  return { instant: new Date(naive - offsetBefore).toISOString(), anomaly: 'gap' };
}

/** Renders a UTC instant as `YYYY-MM-DDTHH:mm` wall-clock time in a zone. */
export function instantToLocal(instant: string, timeZone: string): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new RangeError(`Not an instant: ${instant}`);

  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
}

/**
 * The short zone label shown next to a time whose zone differs from the trip's
 * home zone — `BST`, `PDT`, `GMT+5:30`. Whatever the platform calls it.
 */
export function zoneAbbreviation(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(new Date(instant));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}

/**
 * A short human label for a zone: `Europe/London` → `London`.
 *
 * Preferred over `zoneAbbreviation` for the timeline badge. In September both
 * Europe/London and Europe/Lisbon render as `GMT+1` through `Intl`'s short
 * name, so two genuinely different zones get an identical badge and the badge
 * stops carrying information — which is the whole reason it is there. The IANA
 * city is always distinct and reads better besides.
 */
/**
 * A short, human name for a timezone.
 *
 * **This names the zone, not the place.** `America/Toronto` is the zone for
 * Ottawa, Montreal, Detroit and Iqaluit; `America/New_York` covers Boston and
 * Atlanta. Where the caller knows where the event actually is — a flight knows
 * its airport — show that instead and keep this as the fallback, or the label
 * reads as a wrong city rather than as a timezone.
 */
export function zoneLabel(timeZone: string): string {
  const last = timeZone.split('/').at(-1) ?? timeZone;
  return last.replace(/_/g, ' ');
}

/** Minutes between two instants; how a flight's duration is computed. */
export function minutesBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
}
