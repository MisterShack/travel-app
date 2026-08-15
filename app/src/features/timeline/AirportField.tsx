import { useEffect, useState } from 'react';
import type { Airport } from '@travel/shared/airports';

/**
 * Airport code input that resolves the IANA zone as you type (PLAN.md §8).
 *
 * The table is ~280 KB, so it is imported **dynamically**: the timeline never
 * needs it and must not pay for it on first paint. The service worker precaches
 * the resulting chunk, so the picker still works at an airport with no signal —
 * which is exactly where it gets used.
 *
 * An unknown code does not silently fall back to the trip's home zone. That
 * would produce a plausible-looking but wrong UTC instant for precisely the
 * multi-zone trips the whole timezone rule exists to handle, so the form asks
 * instead.
 */
export function AirportField({
  label,
  code,
  timezone,
  onChange,
}: {
  label: string;
  code: string;
  timezone: string;
  onChange: (code: string, timezone: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Airport[]>([]);
  const [resolved, setResolved] = useState<Airport | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { lookupAirport, searchAirports } = await import('@travel/shared/airports');
      if (cancelled) return;

      const exact = code.length === 3 ? lookupAirport(code) : undefined;
      setResolved(exact ?? null);
      if (exact) {
        setSuggestions([]);
        if (exact.timeZone !== timezone) onChange(exact.iata, exact.timeZone);
      } else {
        setSuggestions(searchAirports(code, 6));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `onChange` and `timezone` are deliberately excluded: including them
    // re-runs the effect on the very change it makes, which loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div>
      <label>{label}</label>
      <input
        value={code}
        onChange={(e) => onChange(e.target.value.toUpperCase().slice(0, 3), timezone)}
        placeholder="LHR"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      {resolved !== null ? (
        <p className="muted tiny">
          {resolved.name}, {resolved.city} — {resolved.timeZone}
        </p>
      ) : code.length === 3 ? (
        <p className="muted tiny">
          Unknown code. Pick the timezone below so the departure time is stored correctly.
        </p>
      ) : null}
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((a) => (
            <li key={a.iata}>
              <button type="button" onClick={() => onChange(a.iata, a.timeZone)}>
                <strong>{a.iata}</strong> — {a.city}, {a.country}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Fallback zone picker, shown when an airport code did not resolve or for
 * lodging and activities, which have no code to look one up from.
 */
export function TimezoneField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (tz: string) => void;
}) {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return (
    <div>
      <label>{label}</label>
      {zones.length > 0 ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {!zones.includes(value) && <option value={value}>{value}</option>}
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Europe/London" />
      )}
    </div>
  );
}
