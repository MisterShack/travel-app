import { useEffect, useId, useState } from 'react';
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
  const listId = useId();
  /**
   * What the user has typed, kept apart from the committed three-letter code.
   *
   * The first version wrote straight through to `code` and sliced input to
   * three characters — which silently made the whole city search unreachable,
   * since "lisb" became "LIS" before it could ever be searched for. A separate
   * query is what lets someone who does not know the code find it by city.
   */
  const [query, setQuery] = useState(code);
  const [options, setOptions] = useState<Airport[]>([]);
  const [resolved, setResolved] = useState<Airport | null>(null);

  // Keep the box in step when the form loads an existing entity.
  useEffect(() => {
    setQuery((q) => (code !== '' && code !== q ? code : q));
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { lookupAirport, searchAirports } = await import('@travel/shared/airports');
      if (cancelled) return;

      const exact = lookupAirport(query);
      setResolved(exact ?? null);
      setOptions(exact ? [] : searchAirports(query, 8));
      if (exact && (exact.iata !== code || exact.timeZone !== timezone)) {
        onChange(exact.iata, exact.timeZone);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `onChange`, `code` and `timezone` are excluded deliberately: including
    // them re-runs the effect on the very change it just made, which loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const hintId = `${listId}-hint`;

  return (
    <div className="field">
      <label className="field-label" htmlFor={listId + '-input'}>
        {label}
      </label>
      {/*
        A native <datalist> rather than a hand-rolled suggestion list.
        The previous version rendered a <ul> of buttons with no combobox
        semantics: arrow keys did nothing, Escape did not dismiss it, nothing
        announced that options had appeared, and the only way past the field was
        to Tab through every suggestion. The browser implements all of that
        correctly for free, and there is no good reason to reimplement it worse.
      */}
      <input
        id={listId + '-input'}
        aria-describedby={hintId}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setQuery(code !== '' ? code : query)}
        list={listId}
        placeholder="LHR, or a city"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      <datalist id={listId}>
        {options.map((a) => (
          <option key={a.iata} value={a.iata}>
            {a.city}, {a.country} — {a.name}
          </option>
        ))}
      </datalist>
      {/* A description, not part of the name: it changes as you type, and a
          field whose *name* changes under you is disorienting to anyone
          navigating by name. */}
      <span className="muted tiny" id={hintId}>
        {resolved !== null
          ? `${resolved.name}, ${resolved.city} — ${resolved.timeZone}`
          : query.trim() !== ''
            ? 'No airport matches yet. Type a code like LHR, or a city name.'
            : ''}
      </span>
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
  const id = useId();
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

  /**
   * Explicit `htmlFor`/`id` here rather than nesting the control in its label,
   * which is what the plain text fields do.
   *
   * A `<select>` carries its options in its own subtree, so a wrapping label's
   * text content becomes "Timezone" followed by all three hundred zone names —
   * and that whole string is the field's accessible name. A screen reader would
   * read the entire list before saying what the field is for.
   */
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {zones.length > 0 ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {!zones.includes(value) && <option value={value}>{value}</option>}
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Europe/London"
        />
      )}
    </div>
  );
}
