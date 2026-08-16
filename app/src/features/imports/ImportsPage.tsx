import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TripSummary } from '@travel/shared';
import { api, ApiError } from '@/api/client';
import { ErrorText } from '@/components/Bits';

/**
 * The booking-import review queue (PLAN.md §4, §6.8).
 *
 * Nothing here writes to a timeline. An import is a *proposal*: the reviewer
 * checks the extraction against the original, corrects it in the normal form,
 * and only then does a real row get created. That is the whole reason the
 * pipeline lands everything as `needs_review` rather than applying it.
 */

type ImportRow = {
  id: string;
  tripId: string | null;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  status: 'pending' | 'needs_review' | 'applied' | 'rejected' | 'failed';
  extractedType: 'flight' | 'lodging' | 'activity' | null;
  extractedFields: string | null;
  parsedBy: 'heuristic' | 'llm' | 'none' | null;
  errorMessage: string | null;
};

const PATH = { flight: 'flight', lodging: 'lodging', activity: 'activity' } as const;

/**
 * Human labels for the extracted fields.
 *
 * The parser's keys are internal names — `departureLocal`, `checkOutLocal` —
 * and rendering them raw made the review screen read like a database dump.
 * Reviewing means comparing this against the email, which is hard if the
 * reader first has to decode the field names.
 */
const LABEL: Record<string, string> = {
  airline: 'Airline',
  flightNumber: 'Flight',
  departureAirport: 'From',
  departureLocal: 'Departs',
  arrivalAirport: 'To',
  arrivalLocal: 'Arrives',
  seat: 'Seat',
  name: 'Name',
  address: 'Address',
  location: 'Where',
  checkInLocal: 'Check in',
  checkOutLocal: 'Check out',
  startLocal: 'Starts',
  endLocal: 'Ends',
  kind: 'Kind',
  confirmationCode: 'Reference',
};

/** `2026-09-10T10:00` → a readable local date and time. */
function pretty(key: string, value: unknown): string {
  const text = String(value);
  if (/Local$/.test(key) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    const [date, time] = text.split('T') as [string, string];
    const shown = new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
    return `${shown}, ${time}`;
  }
  return text;
}

const DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const;

export function ImportsPage() {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    void api
      .get<{ imports: ImportRow[] }>('/imports')
      .then((r) => setRows(r.imports))
      .catch(() => setError('Could not load your imports.'));
    void api.get<{ trips: TripSummary[] }>('/trips').then((r) => setTrips(r.trips));
  };
  useEffect(load, []);

  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Forwarded bookings</h2>
      <p className="muted tiny">
        Forward a confirmation to your import address and it shows up here. Nothing is added to a
        trip until you say so.
      </p>
      {rows.length === 0 && <p className="empty">Nothing waiting to be reviewed.</p>}
      {/*
        Actionable imports first, unreadable ones last. They arrive in whatever
        order the mail did, and a "couldn't read this" card at the top pushes
        the booking you actually need to file below the fold.
      */}
      {[...rows]
        .sort((a, b) => Number(a.status === 'failed') - Number(b.status === 'failed'))
        .map((row) => (
          <ImportCard key={row.id} row={row} trips={trips} onChange={load} />
        ))}
    </>
  );
}

function ImportCard({
  row,
  trips,
  onChange,
}: {
  row: ImportRow;
  trips: TripSummary[];
  onChange: () => void;
}) {
  const navigate = useNavigate();
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [tripId, setTripId] = useState(row.tripId ?? '');
  const fields = row.extractedFields
    ? (JSON.parse(row.extractedFields) as Record<string, unknown>)
    : null;

  const showSource = async () => {
    setSourceError('');
    try {
      const r = await api.get<{ text: string }>(`/imports/${row.id}/source`);
      setSource(r.text);
    } catch (e) {
      // Resend keeps received mail for 30 days, so this can legitimately fail
      // on an old import. Say so rather than showing an empty box.
      setSourceError(e instanceof ApiError ? e.message : 'Could not fetch the original.');
    }
  };

  const review = async () => {
    if (tripId === '') return;
    if (tripId !== row.tripId) await api.post(`/imports/${row.id}/assign`, { tripId });
    // Hand the draft to the normal create form. The import cannot write a row
    // that a human could not have typed, because it goes through the same
    // validated route.
    navigate(`/trips/${tripId}/${PATH[row.extractedType ?? 'activity']}/new`, {
      state: { draft: fields, importId: row.id },
    });
  };

  return (
    <div className="card">
      <div className="row">
        <div className="grow">
          <div className="title">{row.subject}</div>
          <div className="muted tiny">
            from {row.fromAddress} · {new Date(row.receivedAt).toLocaleDateString(undefined, DATE)}
            {row.parsedBy === 'llm' && ' · read by AI'}
          </div>
        </div>
        {row.extractedType && <span className="zone">{row.extractedType}</span>}
      </div>

      {row.status === 'failed' && (
        <p className="banner" role="status">
          Couldn’t read this one{row.errorMessage ? `: ${row.errorMessage}` : ''}. You can still open
          the original and add it by hand.
        </p>
      )}

      {fields && (
        <dl className="extracted">
          {Object.entries(fields)
            .filter(([, v]) => v !== null && v !== '' && v !== undefined)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{LABEL[k] ?? k}</dt>
                <dd>{pretty(k, v)}</dd>
              </div>
            ))}
        </dl>
      )}

      {source !== null && (
        <pre
          className="muted tiny"
          style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', marginTop: 8 }}
        >
          {source}
        </pre>
      )}
      <ErrorText>{sourceError}</ErrorText>

      <div className="field">
        <label className="field-label" htmlFor={`trip-${row.id}`}>
          Add to which trip
        </label>
        <select id={`trip-${row.id}`} value={tripId} onChange={(e) => setTripId(e.target.value)}>
          <option value="">Choose a trip…</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {tripId === '' && (
        <p className="muted tiny">Choose a trip to continue.</p>
      )}
      <div className="actions">
        <button disabled={tripId === ''} onClick={() => void review()}>
          {row.status === 'failed' ? 'Add by hand' : 'Review and add'}
        </button>
        <button className="secondary" onClick={() => void showSource()}>
          Show original
        </button>
        <button
          className="danger"
          onClick={() => void api.post(`/imports/${row.id}/reject`).then(onChange)}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
