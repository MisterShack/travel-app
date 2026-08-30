import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { segmentModes, type Passenger, type SegmentMode } from '@travel/shared';
import { api, ApiError } from '@/api/client';
import { ErrorText, Field, ScreenBar, Warnings } from '@/components/Bits';
import { ChevronIcon } from '@/components/Icons';
import { AirportField, TimezoneField } from './AirportField';
import { ACTIVITY_KINDS, applyDraft, type ActivityKind } from './draft';
import { describeRejection } from './fieldErrors';
import { MODE_COPY } from '@/components/kinds';
import { PassengerFields } from './PassengerFields';
import { storedPassengers } from './passengers';
import { Nearby } from './Nearby';
import { EventPasses } from '@/features/passes/EventPasses';

/**
 * Add/edit form for the three timeline entity types.
 *
 * Times are entered as a local wall-clock value plus a zone and submitted that
 * way — the UTC instant is the server's to derive (PLAN.md §4). The form never
 * computes or sends one, which is why there is no hidden instant field here to
 * get out of step with what the user typed.
 */

type Kind = 'segment' | 'lodging' | 'activity';
const PATHS: Record<Kind, string> = { segment: 'segments', lodging: 'lodging', activity: 'activities' };
/**
 * Fallback only. A new event defaults to the **trip's** home zone, not the
 * browser's — planning a Lisbon trip from a laptop in Chicago otherwise records
 * every restaurant in America/Chicago, producing a plausible-looking timeline
 * whose stored instants are six hours wrong. This is precisely the failure
 * PLAN.md §4 exists to prevent, and it is invisible until you travel.
 */
const guessZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

type State = {
  mode: SegmentMode;
  carrier: string;
  service: string;
  origin: string;
  departureLocal: string;
  departureTimezone: string;
  destination: string;
  arrivalLocal: string;
  arrivalTimezone: string;
  passengers: Passenger[];
  name: string;
  address: string;
  location: string;
  activityKind: ActivityKind;
  startLocal: string;
  startTimezone: string;
  endLocal: string;
  endTimezone: string;
  confirmationCode: string;
  notes: string;
};

const blank = (): State => ({
  mode: 'air',
  carrier: '',
  service: '',
  origin: '',
  departureLocal: '',
  departureTimezone: guessZone(),
  destination: '',
  arrivalLocal: '',
  arrivalTimezone: guessZone(),
  // Always at least one row, so there is somewhere to type. Blank rows are
  // dropped on save rather than stored.
  passengers: [{ name: '', seat: '' }],
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
   * The address **as the server has it**, tracked apart from the form field.
   *
   * "What's nearby" asks the server about the stored row, so an unsaved edit to
   * the address field would produce an answer about somewhere the screen is no
   * longer showing. Keeping the stored value lets the panel notice that and say
   * so rather than answering the wrong question convincingly.
   */
  const [storedAddress, setStoredAddress] = useState('');
  /**
   * A draft handed over from the import review queue. It only ever *prefills*
   * the form — the user still submits through the same validated route, which
   * is what stops an import writing a row a human could not have typed
   * (PLAN.md §4).
   */
  /**
   * The add sheet offers "Flight" and "Train" as separate choices, because to a
   * traveller they are separate things even though the model treats them as one
   * kind. It says which by query parameter, so a deep link to "add a train"
   * works and is bookmarkable — the select below can still change it.
   */
  const [params] = useSearchParams();
  const requestedMode = params.get('mode');

  const handover = (useLocation().state ?? {}) as {
    draft?: Record<string, unknown>;
    importId?: string;
    /** Which leg of a multi-leg booking this is, so the import knows what is left. */
    segment?: number | null;
  };
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<State>) => setF((prev) => ({ ...prev, ...patch }));
  const kindSelectId = useId();
  const modeSelectId = useId();

  /**
   * The trip's home zone, used as the default for a new event's times. Fetched
   * rather than passed through route state so a deep link into the form gets it
   * too.
   */
  useEffect(() => {
    if (isNew && requestedMode !== null && (segmentModes as readonly string[]).includes(requestedMode)) {
      setF((prev) => ({ ...prev, mode: requestedMode as SegmentMode }));
    }
    // Runs once: after this the select owns the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = handover.draft;
    if (!d) return;
    setF((prev) => applyDraft(prev, d));
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
          mode: (item['mode'] as SegmentMode) ?? 'air',
          carrier: item['carrier'] ?? '',
          service: item['service'] ?? '',
          origin: item['origin'] ?? '',
          departureLocal: item['departureLocal'] ?? '',
          departureTimezone: item['departureTimezone'] ?? guessZone(),
          destination: item['destination'] ?? '',
          arrivalLocal: item['arrivalLocal'] ?? '',
          arrivalTimezone: item['arrivalTimezone'] ?? guessZone(),
          passengers: storedPassengers(item['passengers']),
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
        setStoredAddress(item['address'] ?? item['location'] ?? '');
      })
      .catch(() => setError('Could not load this item.'));
  }, [id, kind, isNew]);

  /**
   * What each schema path is called on this screen — the label the user is
   * actually looking at, not the field's name in the model. The segment labels
   * follow the mode, so a Via Rail booking is told to look at "Operator" rather
   * than at "Airline".
   */
  const fieldLabels = (): Record<string, string> => {
    const common = { confirmationCode: 'Confirmation code', notes: 'Notes' };
    if (kind === 'segment') {
      return {
        ...common,
        mode: 'How',
        carrier: MODE_COPY[f.mode].carrier,
        service: MODE_COPY[f.mode].service,
        origin: MODE_COPY[f.mode].origin,
        departure: 'Departs',
        destination: MODE_COPY[f.mode].destination,
        arrival: 'Arrives',
        passengers: 'Who is travelling',
      };
    }
    if (kind === 'lodging') {
      return { ...common, name: 'Name', address: 'Address', checkIn: 'Check in', checkOut: 'Check out' };
    }
    return { ...common, kind: 'What', name: 'Name', location: 'Where', start: 'Starts', end: 'Ends' };
  };

  const payload = (): Record<string, unknown> => {
    const common = { confirmationCode: opt(f.confirmationCode), notes: opt(f.notes) };
    if (kind === 'segment') {
      return {
        ...common,
        mode: f.mode,
        carrier: f.carrier,
        service: f.service,
        origin: f.origin,
        departure: { local: f.departureLocal, timezone: f.departureTimezone },
        destination: f.destination,
        arrival: { local: f.arrivalLocal, timezone: f.arrivalTimezone },
        passengers: f.passengers,
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
    /*
     * The guard, not a disabled button.
     *
     * Disabling a control in response to activating it drops focus to `<body>`:
     * the reader loses their place, the next Tab starts again at "Skip to
     * content", and nothing is announced for the length of the request — which
     * on an airport connection is the only time any of this is visible. This
     * app has now had that bug three times (BRAND.md §6, and the two in
     * CLAUDE.md), so the button stays enabled and a second press is refused
     * here instead.
     */
    if (busy) return;
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
        setStoredAddress(kind === 'lodging' ? f.address.trim() : f.location.trim());

        if (result.warnings && result.warnings.length > 0) {
          setWarnings(result.warnings);
          setSavedId(isNew ? ((result as { id?: string }).id ?? null) : (id ?? null));
          setBusy(false);
          return;
        }
        // Only now is the import considered applied — after a human saved a
        // real row from it.
        if (handover.importId) {
          // The leg index, so a return trip does not file its email after the
          // outbound and take the return with it.
          await api
            .post(`/imports/${handover.importId}/apply`, {
              ...(typeof handover.segment === 'number' ? { segment: handover.segment } : {}),
            })
            .catch(() => {});
        }
        navigate(`/trips/${tripId}`, { replace: true });
      } catch (err) {
        /**
         * Name the fields. The server sends the Zod issues with the message,
         * and each carries the path it failed at, so "Check the journey
         * details." can become "…Look at From and Arrives." — which is the
         * difference between an error a listener can act on and one they have
         * to hunt for (WCAG 3.3.1).
         */
        setError(
          err instanceof ApiError
            ? describeRejection(err.message, err.issues, fieldLabels())
            : 'Could not reach the server.',
        );
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

  /**
   * The row the server has, which only exists once something has been saved.
   * Both panels below need it: "what's nearby" asks the server about this id,
   * and a pass is stored bound to it.
   */
  const savedEventId = savedId ?? (isNew ? null : (id ?? null));
  const showNearby =
    (kind === 'lodging' || kind === 'activity') && savedEventId !== null && storedAddress !== '';

  return (
    <>
    {/* The way out. Outside the form, above the heading, so it is the first
        thing in the tab order on a screen that no longer shows the tab bar. */}
    <ScreenBar to={`/trips/${tripId}`} label="Back to trip" />
    <form onSubmit={onSubmit}>
      <h2>
        {isNew ? 'Add' : 'Edit'}{' '}
        {kind === 'segment' ? MODE_COPY[f.mode].label.toLowerCase() : kind === 'lodging' ? 'stay' : kind}
      </h2>

      {kind === 'segment' && (
        <>
          {/* The mode chooses the words for everything below it. Calling a Via
              Rail booking's operator an "Airline" is the flight-first
              assumption this phase removes (PLAN-V3 §3a). */}
          <div className="field">
            <label className="field-label" htmlFor={modeSelectId}>
              How
            </label>
            <select
              id={modeSelectId}
              value={f.mode}
              onChange={(e) => set({ mode: e.target.value as SegmentMode })}
            >
              {segmentModes.map((m) => (
                <option value={m} key={m}>
                  {MODE_COPY[m].label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid2">
            <Field label={MODE_COPY[f.mode].carrier}>
              <input value={f.carrier} onChange={(e) => set({ carrier: e.target.value })} required />
            </Field>
            <Field label={MODE_COPY[f.mode].service}>
              <input value={f.service} onChange={(e) => set({ service: e.target.value })} required />
            </Field>
          </div>
          {/*
            Air endpoints are airport codes, and the code is what derives the
            zone. There is no IATA for stations, so rail, coach and ferry take a
            name and are asked for their zone — exactly as lodging already is.
          */}
          {f.mode === 'air' ? (
            <AirportField
              label={MODE_COPY[f.mode].origin}
              code={f.origin}
              timezone={f.departureTimezone}
              onChange={(code, tz) => set({ origin: code, departureTimezone: tz })}
            />
          ) : (
            <>
              <Field label={MODE_COPY[f.mode].origin}>
                <input value={f.origin} onChange={(e) => set({ origin: e.target.value })} required />
              </Field>
              {/*
                Setting the departure zone sets the arrival zone too. Most rail
                journeys do not cross a zone, and leaving the arrival on the
                trip's home zone while the departure moved records an instant
                hours out — silently, because both fields look filled in. A
                journey that does cross one changes the arrival afterwards.
              */}
              <TimezoneField
                label="Departure timezone"
                value={f.departureTimezone}
                onChange={(tz) => set({ departureTimezone: tz, arrivalTimezone: tz })}
              />
            </>
          )}
          <Field label={`Departs (local time at ${f.mode === 'air' ? 'the airport' : 'the origin'})`}>
            <input
              type="datetime-local"
              value={f.departureLocal}
              onChange={(e) => set({ departureLocal: e.target.value.slice(0, 16) })}
              required
            />
          </Field>
          {f.mode === 'air' ? (
            <AirportField
              label={MODE_COPY[f.mode].destination}
              code={f.destination}
              timezone={f.arrivalTimezone}
              onChange={(code, tz) => set({ destination: code, arrivalTimezone: tz })}
            />
          ) : (
            <>
              <Field label={MODE_COPY[f.mode].destination}>
                <input
                  value={f.destination}
                  onChange={(e) => set({ destination: e.target.value })}
                  required
                />
              </Field>
              <TimezoneField
                label="Arrival timezone"
                value={f.arrivalTimezone}
                onChange={(tz) => set({ arrivalTimezone: tz })}
              />
            </>
          )}
          <Field label="Arrives (local time at the destination)">
            <input
              type="datetime-local"
              value={f.arrivalLocal}
              onChange={(e) => set({ arrivalLocal: e.target.value.slice(0, 16) })}
              required
            />
          </Field>
          <PassengerFields
            passengers={f.passengers}
            onChange={(passengers) => set({ passengers })}
          />
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
            {/* Options come from the same list the import mapping validates
                against, so the two cannot drift into disagreeing about what a
                kind is. */}
            <select
              id={kindSelectId}
              value={f.activityKind}
              onChange={(e) => set({ activityKind: e.target.value as ActivityKind })}
            >
              {ACTIVITY_KINDS.map((k) => (
                <option value={k} key={k}>
                  {k[0]!.toUpperCase() + k.slice(1)}
                </option>
              ))}
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

      {/*
        Everything a booking does not need, folded away.

        These two stood between the last field a flight actually requires and
        the button that saves it, on a form already 1.7 phone screens tall. A
        `<details>` rather than component state: it is keyboard operable and
        announced as expandable without being told to be, and the browser opens
        it by itself when someone uses find-in-page on a word inside it.
      */}
      <details className="optional-fields">
        {/* The chevron is a sibling of the hint, not inside it: `.hint` clips
            its own overflow, so at 200% text "Confirmation code, notes" no
            longer fits and the arrow was pushed out and clipped along with the
            rest of the sentence. */}
        <summary>
          More details
          <span className="hint">Confirmation code, notes</span>
          <ChevronIcon className="caret" />
        </summary>
        <div className="inner">
          <Field label="Confirmation code">
            <input value={f.confirmationCode} onChange={(e) => set({ confirmationCode: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Notes">
            <textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </details>

      <Warnings items={warnings} />
      {warnings.length > 0 && (
        <p className="muted tiny">
          Saved. If that is not what you meant, change the time above and save again.
        </p>
      )}
      <ErrorText>{error}</ErrorText>

      {/*
        Deleting is not one of the two things this row is for.

        It sits above rather than beside them: the pinned row is within a
        thumb's reach at all times by design, and putting an irreversible action
        in a bar built to be easy to hit by feel is how someone loses a flight.
      */}
      {(!isNew || savedId !== null) && (
        <div className="actions">
          <button type="button" className="danger" onClick={remove}>
            Delete
          </button>
        </div>
      )}

      {/*
        Pinned to the bottom of a phone, in flow on anything wider. Add sat
        under two optional fields at the end of a form most of two screens
        tall; a person who has typed everything the flight needs should not
        have to scroll past what it does not.
      */}
      {/*
        Mounted empty from the first render, always.

        A live region that only exists once it has something to say enters the
        accessibility tree in the same commit as its first message, which is the
        one case a live region does not survive — Phase 10 lost a day to exactly
        this. Empty here, and it announces the moment `busy` flips.
      */}
      <p className="visually-hidden saving-live" role="status">
        {busy ? 'Saving…' : ''}
      </p>

      <div className="actions pinned">
        <button aria-disabled={busy}>{savedId !== null || !isNew ? 'Save' : 'Add'}</button>
        <Link className="btn secondary" to={`/trips/${tripId}`}>
          {warnings.length > 0 ? 'Back to trip' : 'Cancel'}
        </Link>
      </div>
    </form>

    {/*
      * Also outside the <form>, and for the same reason as the panel below it.
      * Only for a row the server already has: a pass binds to an id, and until
      * something is saved there is nothing to bind to.
      */}
    {savedEventId !== null && (
      <EventPasses tripId={tripId} relatedType={kind as Kind} relatedId={savedEventId} />
    )}

    {/*
      * Outside the <form>, deliberately. Asking what is nearby is not part of
      * editing the event, and a button inside a form is a submit button unless
      * every one of them remembers to say otherwise — a trap worth designing
      * out rather than remembering.
      *
      * Segments get no panel, the same line Phase 8 drew for Directions: an
      * IATA code is not an address and a station's city is not the station.
      */}
    {showNearby && (
      <Nearby
        kind={kind as 'lodging' | 'activity'}
        id={savedEventId}
        stored={storedAddress}
        edited={(kind === 'lodging' ? f.address.trim() : f.location.trim()) !== storedAddress}
      />
    )}
    </>
  );
}
