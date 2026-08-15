import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '@/api/client';
import { ErrorText, Field, Warnings } from '@/components/Bits';
import { AirportField, TimezoneField } from './AirportField';

/**
 * Add/edit form for the three timeline entity types.
 *
 * Times are entered as a local wall-clock value plus a zone and submitted that
 * way — the UTC instant is the server's to derive (PLAN.md §4). The form never
 * computes or sends one, which is why there is no hidden instant field here to
 * get out of step with what the user typed.
 */

type Kind = 'flight' | 'lodging' | 'activity';
const PATHS: Record<Kind, string> = { flight: 'flights', lodging: 'lodging', activity: 'activities' };
/**
 * Fallback only. A new event defaults to the **trip's** home zone, not the
 * browser's — planning a Lisbon trip from a laptop in Chicago otherwise records
 * every restaurant in America/Chicago, producing a plausible-looking timeline
 * whose stored instants are six hours wrong. This is precisely the failure
 * PLAN.md §4 exists to prevent, and it is invisible until you travel.
 */
const guessZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

type State = {
  airline: string;
  flightNumber: string;
  departureAirport: string;
  departureLocal: string;
  departureTimezone: string;
  arrivalAirport: string;
  arrivalLocal: string;
  arrivalTimezone: string;
  seat: string;
  name: string;
  address: string;
  location: string;
  activityKind: 'restaurant' | 'attraction' | 'transport' | 'other';
  startLocal: string;
  startTimezone: string;
  endLocal: string;
  endTimezone: string;
  confirmationCode: string;
  notes: string;
};

const blank = (): State => ({
  airline: '',
  flightNumber: '',
  departureAirport: '',
  departureLocal: '',
  departureTimezone: guessZone(),
  arrivalAirport: '',
  arrivalLocal: '',
  arrivalTimezone: guessZone(),
  seat: '',
  name: '',
  address: '',
  location: '',
  activityKind: 'other',
  startLocal: '',
  startTimezone: guessZone(),
  endLocal: '',
  endTimezone: guessZone(),
  confirmationCode: '',
  notes: '',
});

const opt = (v: string) => (v.trim() === '' ? undefined : v.trim());

export function EventFormPage() {
  const { tripId = '', kind = 'activity', id } = useParams<{ tripId: string; kind: Kind; id: string }>();
  const navigate = useNavigate();
  const isNew = id === undefined || id === 'new';
  const [f, setF] = useState<State>(blank);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  /** Set once the server has stored the row, so the UI stops offering "Add". */
  const [savedId, setSavedId] = useState<string | null>(null);
  /**
   * A draft handed over from the import review queue. It only ever *prefills*
   * the form — the user still submits through the same validated route, which
   * is what stops an import writing a row a human could not have typed
   * (PLAN.md §4).
   */
  const handover = (useLocation().state ?? {}) as {
    draft?: Record<string, unknown>;
    importId?: string;
  };
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<State>) => setF((prev) => ({ ...prev, ...patch }));
  const kindSelectId = useId();

  /**
   * The trip's home zone, used as the default for a new event's times. Fetched
   * rather than passed through route state so a deep link into the form gets it
   * too.
   */
  useEffect(() => {
    const d = handover.draft;
    if (!d) return;
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
    setF((prev) => ({
      ...prev,
      airline: str('airline') || prev.airline,
      flightNumber: str('flightNumber') || prev.flightNumber,
      departureAirport: str('departureAirport') || prev.departureAirport,
      departureLocal: str('departureLocal') || prev.departureLocal,
      arrivalAirport: str('arrivalAirport') || prev.arrivalAirport,
      arrivalLocal: str('arrivalLocal') || prev.arrivalLocal,
      seat: str('seat') || prev.seat,
      name: str('name') || prev.name,
      address: str('address') || prev.address,
      location: str('location') || prev.location,
      startLocal: str('startLocal') || str('checkInLocal') || prev.startLocal,
      endLocal: str('endLocal') || str('checkOutLocal') || prev.endLocal,
      confirmationCode: str('confirmationCode') || prev.confirmationCode,
    }));
    // Handover happens once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isNew) return;
    void api
      .get<{ trip: { homeTimezone: string } }>(`/trips/${tripId}`)
      .then(({ trip }) =>
        setF((prev) => ({
          ...prev,
          // Only fill zones the user has not already changed.
          departureTimezone: prev.departureTimezone === guessZone() ? trip.homeTimezone : prev.departureTimezone,
          arrivalTimezone: prev.arrivalTimezone === guessZone() ? trip.homeTimezone : prev.arrivalTimezone,
          startTimezone: prev.startTimezone === guessZone() ? trip.homeTimezone : prev.startTimezone,
          endTimezone: prev.endTimezone === guessZone() ? trip.homeTimezone : prev.endTimezone,
        })),
      )
      .catch(() => {
        /* falls back to the browser zone, which the form still shows and the
           user can correct */
      });
  }, [tripId, isNew]);

  useEffect(() => {
    if (isNew) return;
    void api
      .get<{ item: Record<string, string | null> }>(`/${PATHS[kind as Kind]}/${id}`)
      .then(({ item }) => {
        if (!item) return;
        setF({
          ...blank(),
          airline: item['airline'] ?? '',
          flightNumber: item['flightNumber'] ?? '',
          departureAirport: item['departureAirport'] ?? '',
          departureLocal: item['departureLocal'] ?? '',
          departureTimezone: item['departureTimezone'] ?? guessZone(),
          arrivalAirport: item['arrivalAirport'] ?? '',
          arrivalLocal: item['arrivalLocal'] ?? '',
          arrivalTimezone: item['arrivalTimezone'] ?? guessZone(),
          seat: item['seat'] ?? '',
          name: item['name'] ?? '',
          address: item['address'] ?? '',
          location: item['location'] ?? '',
          activityKind: (item['kind'] as State['activityKind']) ?? 'other',
          startLocal: item['startLocal'] ?? item['checkInLocal'] ?? '',
          startTimezone: item['startTimezone'] ?? item['checkInTimezone'] ?? guessZone(),
          endLocal: item['endLocal'] ?? item['checkOutLocal'] ?? '',
          endTimezone: item['endTimezone'] ?? item['checkOutTimezone'] ?? guessZone(),
          confirmationCode: item['confirmationCode'] ?? '',
          notes: item['notes'] ?? '',
        });
      })
      .catch(() => setError('Could not load this item.'));
  }, [id, kind, isNew]);

  const payload = (): Record<string, unknown> => {
    const common = { confirmationCode: opt(f.confirmationCode), notes: opt(f.notes) };
    if (kind === 'flight') {
      return {
        ...common,
        airline: f.airline,
        flightNumber: f.flightNumber,
        departureAirport: f.departureAirport,
        departure: { local: f.departureLocal, timezone: f.departureTimezone },
        arrivalAirport: f.arrivalAirport,
        arrival: { local: f.arrivalLocal, timezone: f.arrivalTimezone },
        seat: opt(f.seat),
      };
    }
    if (kind === 'lodging') {
      return {
        ...common,
        name: f.name,
        address: opt(f.address),
        checkIn: { local: f.startLocal, timezone: f.startTimezone },
        checkOut: { local: f.endLocal, timezone: f.endTimezone },
      };
    }
    return {
      ...common,
      kind: f.activityKind,
      name: f.name,
      location: opt(f.location),
      start: { local: f.startLocal, timezone: f.startTimezone },
      ...(f.endLocal === '' ? {} : { end: { local: f.endLocal, timezone: f.endTimezone } }),
    };
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setWarnings([]);
    void (async () => {
      try {
        // Once saved, a further submit must edit that row rather than create
        // another — otherwise acknowledging a DST warning duplicates the entry.
        const targetId = savedId ?? (isNew ? null : (id ?? null));
        const result =
          targetId === null
            ? await api.post<{ warnings?: string[]; id?: string }>(
                `/trips/${tripId}/${PATHS[kind as Kind]}`,
                payload(),
              )
            : await api.patch<{ warnings?: string[] }>(`/${PATHS[kind as Kind]}/${targetId}`, payload());

        // The item is already saved at this point — the server stores it and
        // reports the anomaly alongside. So this stops to *show* the warning,
        // it does not ask for a resubmit: submitting again would create a
        // second copy. The user reads it and either goes back or edits the
        // time, which is a PATCH of the row that now exists.
        if (result.warnings && result.warnings.length > 0) {
          setWarnings(result.warnings);
          setSavedId(isNew ? ((result as { id?: string }).id ?? null) : (id ?? null));
          setBusy(false);
          return;
        }
        // Only now is the import considered applied — after a human saved a
        // real row from it.
        if (handover.importId) await api.post(`/imports/${handover.importId}/apply`).catch(() => {});
        navigate(`/trips/${tripId}`, { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
        setBusy(false);
      }
    })();
  };

  const remove = () => {
    if (!confirm('Delete this from the trip?')) return;
    const targetId = savedId ?? id;
    void api
      .delete(`/${PATHS[kind as Kind]}/${targetId}`)
      .then(() => navigate(`/trips/${tripId}`, { replace: true }));
  };

  return (
    <form onSubmit={onSubmit}>
      <h2>
        {isNew ? 'Add' : 'Edit'} {kind === 'lodging' ? 'stay' : kind}
      </h2>

      {kind === 'flight' && (
        <>
          <div className="grid2">
            <Field label="Airline">
              <input value={f.airline} onChange={(e) => set({ airline: e.target.value })} required />
            </Field>
            <Field label="Flight number">
              <input value={f.flightNumber} onChange={(e) => set({ flightNumber: e.target.value })} required />
            </Field>
          </div>
          <AirportField
            label="From"
            code={f.departureAirport}
            timezone={f.departureTimezone}
            onChange={(code, tz) => set({ departureAirport: code, departureTimezone: tz })}
          />
          <Field label="Departs (local time at the airport)">
            <input
              type="datetime-local"
              value={f.departureLocal}
              onChange={(e) => set({ departureLocal: e.target.value.slice(0, 16) })}
              required
            />
          </Field>
          <AirportField
            label="To"
            code={f.arrivalAirport}
            timezone={f.arrivalTimezone}
            onChange={(code, tz) => set({ arrivalAirport: code, arrivalTimezone: tz })}
          />
          <Field label="Arrives (local time at the destination)">
            <input
              type="datetime-local"
              value={f.arrivalLocal}
              onChange={(e) => set({ arrivalLocal: e.target.value.slice(0, 16) })}
              required
            />
          </Field>
          <Field label="Seat">
            <input value={f.seat} onChange={(e) => set({ seat: e.target.value })} placeholder="Optional" />
          </Field>
        </>
      )}

      {kind === 'lodging' && (
        <>
          <Field label="Name">
            <input value={f.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <Field label="Address">
            <input value={f.address} onChange={(e) => set({ address: e.target.value })} placeholder="Optional" />
          </Field>
          <TimezoneField label="Timezone" value={f.startTimezone} onChange={(tz) => set({ startTimezone: tz, endTimezone: tz })} />
          <div className="grid2">
            <Field label="Check in">
              <input
                type="datetime-local"
                value={f.startLocal}
                onChange={(e) => set({ startLocal: e.target.value.slice(0, 16) })}
                required
              />
            </Field>
            <Field label="Check out">
              <input
                type="datetime-local"
                value={f.endLocal}
                onChange={(e) => set({ endLocal: e.target.value.slice(0, 16) })}
                required
              />
            </Field>
          </div>
        </>
      )}

      {kind === 'activity' && (
        <>
          {/* A select gets an explicit label association — nesting it would
              fold every option into the field's accessible name. */}
          <div className="field">
            <label className="field-label" htmlFor={kindSelectId}>
              What
            </label>
            <select
              id={kindSelectId}
              value={f.activityKind}
              onChange={(e) => set({ activityKind: e.target.value as State['activityKind'] })}
            >
              <option value="restaurant">Restaurant</option>
              <option value="attraction">Attraction</option>
              <option value="transport">Transport</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Field label="Name">
            <input value={f.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <Field label="Where">
            <input value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="Optional" />
          </Field>
          <TimezoneField label="Timezone" value={f.startTimezone} onChange={(tz) => set({ startTimezone: tz, endTimezone: tz })} />
          <div className="grid2">
            <Field label="Starts">
              <input
                type="datetime-local"
                value={f.startLocal}
                onChange={(e) => set({ startLocal: e.target.value.slice(0, 16) })}
                required
              />
            </Field>
            <Field label="Ends" >
              <input
                type="datetime-local"
                value={f.endLocal}
                onChange={(e) => set({ endLocal: e.target.value.slice(0, 16) })}
              />
            </Field>
          </div>
        </>
      )}

      <Field label="Confirmation code">
        <input value={f.confirmationCode} onChange={(e) => set({ confirmationCode: e.target.value })} placeholder="Optional" />
      </Field>
      <Field label="Notes">
        <textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      <Warnings items={warnings} />
      {warnings.length > 0 && (
        <p className="muted tiny">
          Saved. If that is not what you meant, change the time above and save again.
        </p>
      )}
      <ErrorText>{error}</ErrorText>

      <div className="actions">
        <button disabled={busy}>{savedId !== null || !isNew ? 'Save' : 'Add'}</button>
        <Link to={`/trips/${tripId}`}>{warnings.length > 0 ? 'Back to trip' : 'Cancel'}</Link>
        {(!isNew || savedId !== null) && (
          <button type="button" className="danger" onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
