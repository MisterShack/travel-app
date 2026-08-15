#!/usr/bin/env python3
"""Regenerates shared/src/airports.ts from an OpenFlights airports.dat snapshot.

Usage: python3 scripts/build-airports.py <path-to-airports.dat>

Filters to entries with a real three-letter IATA code and a timezone, dedupes on
the code, and validates every zone before writing.
"""
import csv, json, re, sys, pathlib

src = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).resolve().parent.parent / 'shared' / 'src' / 'airports.ts'

rows = {}
with src.open(encoding='utf-8') as f:
    for r in csv.reader(f):
        if len(r) < 13:
            continue
        iata, tz, name, city, country, kind = r[4], r[11], r[1], r[2], r[3], r[12]
        if kind != 'airport' or not re.fullmatch(r'[A-Z]{3}', iata) or tz in ('', '\\N'):
            continue
        rows.setdefault(iata, (tz, name, city, country))

import zoneinfo
zones = sorted({v[0] for v in rows.values()})
for z in zones:
    zoneinfo.ZoneInfo(z)  # raises if the platform does not know it

zi = {z: i for i, z in enumerate(zones)}
# Tabs separate fields, so strip any that appear inside a name.
def clean(s):
    return s.replace('\t', ' ').replace('\n', ' ').replace('\\', '').replace('`', "'").replace('$', 'S')

table = '\n'.join(
    f"{k}\t{zi[v[0]]}\t{clean(v[1])}\t{clean(v[2])}\t{clean(v[3])}"
    for k, v in sorted(rows.items())
)

HEADER = '''/**
 * IATA airport code -> IANA timezone, with enough name to run a picker.
 *
 * PLAN.md §8: converting a typed local time to a UTC instant needs the zone,
 * and the user types an airport code, not `Europe/London`. This table closes
 * that gap. Bundled rather than fetched — an airport is exactly where you are
 * when you need it, and exactly where the network is worst.
 *
 * Kept in its own module and imported lazily: the timeline never needs it, only
 * the add/edit flight form does, so it is a separate chunk rather than weight
 * on first paint. The service worker still precaches it, so the picker works
 * offline.
 *
 * Encoded as one tab-separated line per airport against a shared zone array and
 * parsed on first use — an object literal of the same data is several times
 * larger and slower to parse.
 *
 * Source: OpenFlights (https://openflights.org/data.php), snapshot 2026-08-15,
 * filtered to entries with a real three-letter IATA code and a timezone. Made
 * available by OpenFlights under the Open Database License (ODbL); this file is
 * a derived database and carries the same terms.
 *
 * Regenerate: python3 scripts/build-airports.py path/to/airports.dat
 */

const ZONES: readonly string[] = ZONES_JSON;

const TABLE = `TABLE_BODY`;
'''

BODY = '''

export type Airport = {
  /** Three-letter IATA code, upper-case. */
  iata: string;
  /** IANA timezone name. */
  timeZone: string;
  name: string;
  city: string;
  country: string;
};

let index: Map<string, Airport> | null = null;

function build(): Map<string, Airport> {
  const map = new Map<string, Airport>();
  for (const line of TABLE.split('\\n')) {
    if (line === '') continue;
    const [iata, zoneIndex, name, city, country] = line.split('\\t');
    if (iata === undefined || zoneIndex === undefined) continue;
    map.set(iata, {
      iata,
      timeZone: ZONES[Number(zoneIndex)] ?? 'UTC',
      name: name ?? '',
      city: city ?? '',
      country: country ?? '',
    });
  }
  return map;
}

function airports(): Map<string, Airport> {
  index ??= build();
  return index;
}

/** The airport for a code, or `undefined` — the form asks rather than guessing. */
export function lookupAirport(code: string): Airport | undefined {
  return airports().get(code.trim().toUpperCase());
}

/** The zone for an airport code, or `undefined` if the code is unknown. */
export function airportTimeZone(code: string): string | undefined {
  return lookupAirport(code)?.timeZone;
}

/**
 * Substring search over code, name and city, for the picker. An exact code
 * match comes first — someone typing "LHR" wants Heathrow, not every airport
 * whose name happens to contain those letters.
 */
export function searchAirports(query: string, limit = 12): Airport[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const exact: Airport[] = [];
  const partial: Airport[] = [];
  for (const a of airports().values()) {
    if (a.iata.toLowerCase() === q) {
      exact.push(a);
    } else if (
      a.iata.toLowerCase().startsWith(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
    ) {
      if (partial.length < limit) partial.push(a);
    }
  }
  return [...exact, ...partial].slice(0, limit);
}

export const AIRPORT_COUNT = __AIRPORT_COUNT__;
'''

text = (
    HEADER.replace('ZONES_JSON', json.dumps(zones, separators=(',', ':'))).replace('TABLE_BODY', table)
    + BODY.replace('__AIRPORT_COUNT__', str(len(rows)))
)
out.write_text(text, encoding='utf-8')
print(f"wrote {out} — {len(rows)} airports, {len(zones)} zones, {len(text)/1024:.0f} KB")
