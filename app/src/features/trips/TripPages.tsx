import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatCalendarDate, type TimelineItem, type TripSummary } from '@travel/shared';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/useAuth';
import { ErrorText, Field, Sheet, Skeleton, StaleBanner } from '@/components/Bits';
import { BackIcon, KindChip, ManageIcon, PlusIcon } from '@/components/Icons';
import { countedKindLabel } from '@/components/kinds';
import { hasEnded, tripStatus } from '@/features/trips/status';
import { useHour12 } from '@/prefs/useHour12';
import { loadTimeline, loadTrip, loadTrips, type Loaded } from '@/data/repository';
import { Timeline } from '@/features/timeline/Timeline';
import { Issues } from '@/features/timeline/Issues';
import { NotificationSettings } from '@/features/notify/NotificationSettings';
import { TimezoneField } from '@/features/timeline/AirportField';

const guessZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const KINDS = ['segment', 'lodging', 'activity'] as const;

/**
 * What the add sheet offers.
 *
 * A flight and a train are the same kind of thing to the data model and two
 * different things to a traveller, so the sheet asks for the mode directly
 * rather than making anyone pick "Journey" and then a mode. Coach and ferry are
 * reachable by switching mode inside the form — four options is a choice, seven
 * is a menu.
 */
const ADD_OPTIONS = [
  {
    to: 'segment/new',
    kind: 'segment' as const,
    mode: 'air' as const,
    label: 'Flight',
    hint: 'Departure and arrival, each in its own timezone',
  },
  {
    to: 'segment/new?mode=rail',
    kind: 'segment' as const,
    mode: 'rail' as const,
    label: 'Train',
    hint: 'A rail journey, with the station it actually arrives at',
  },
  {
    to: 'lodging/new',
    kind: 'lodging' as const,
    mode: null,
    label: 'Stay',
    hint: 'Check-in and check-out',
  },
  {
    to: 'activity/new',
    kind: 'activity' as const,
    mode: null,
    label: 'Activity',
    hint: 'A booking, a reservation, or something to be somewhere for',
  },
];

/** A date range, rendered in the reader's locale. */
function formatRange(startDate: string, endDate: string): string {
  const fmt = (d: string, withYear: boolean) =>
    formatCalendarDate(d, {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(startDate, false)} – ${fmt(endDate, true)}`;
}

function Tallies({ items }: { items: TimelineItem[] }) {
  const counts = KINDS.map((kind) => [kind, items.filter((i) => i.kind === kind).length] as const)
    // A row of zeroes is a report about emptiness, not information.
    .filter(([, n]) => n > 0);
  if (counts.length === 0) return null;

  return (
    <div className="tallies">
      {counts.map(([kind, n]) => (
        <span className={`tally kind-${kind}`} key={kind}>
          <span className="dot" aria-hidden="true" />
          <b>{n}</b> {countedKindLabel(kind, n)}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ list -- */

export function TripListPage() {
  const { user } = useAuth();
  const [state, setState] = useState<Loaded<TripSummary[]> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    void loadTrips(user.id)
      .then(setState)
      .catch(() => setError('Could not load your trips, and nothing is saved on this device yet.'));
  }, [user]);

  if (error) return <p className="error">{error}</p>;
  if (!state) return <Skeleton rows={3} label="Loading your trips" />;

  // "Ended" is asked of each trip in its *own* home zone — the same question the
  // status badge on the card answers, so the two cannot disagree.
  const upcoming = state.data.filter((t) => !hasEnded(t));
  const past = state.data.filter((t) => hasEnded(t));

  return (
    <>
      {state.stale && <StaleBanner savedAt={state.savedAt} />}

      <div className="section-head">
        <h2 className="screen-title">Trips</h2>
        <Link className="btn" to="/trips/new">
          <PlusIcon size={18} />
          New trip
        </Link>
      </div>

      {state.data.length === 0 && (
        <div className="empty">
          <p>No trips yet.</p>
          <p className="muted">
            Start one, then add flights and stays — or forward a confirmation email and it will be
            waiting in your inbox.
          </p>
        </div>
      )}

      {upcoming.length > 0 && <h2>Upcoming</h2>}
      {upcoming.map((t) => (
        <TripCard key={t.id} trip={t} />
      ))}
      {past.length > 0 && <h2>Past</h2>}
      {past.map((t) => (
        <TripCard key={t.id} trip={t} />
      ))}
    </>
  );
}

function TripCard({ trip }: { trip: TripSummary }) {
  const status = tripStatus(trip);

  return (
    <Link className="card link" to={`/trips/${trip.id}`}>
      <div className="row">
        <div className="grow">
          <div className="title">{trip.name}</div>
          <div className="muted">
            {trip.destination !== null && trip.destination !== '' ? `${trip.destination} · ` : ''}
            {formatRange(trip.startDate, trip.endDate)}
          </div>
          <span className={`status ${status.tone}`}>{status.text}</span>
        </div>
        {trip.memberCount > 1 && <span className="muted tiny">{trip.memberCount} people</span>}
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ form -- */

export function TripFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    destination: '',
    startDate: '',
    endDate: '',
    homeTimezone: guessZone(),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    void (async () => {
      try {
        const { id } = await api.post<{ id: string }>('/trips', {
          ...form,
          destination: form.destination === '' ? undefined : form.destination,
        });
        navigate(`/trips/${id}`, { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <form onSubmit={onSubmit}>
      <h2 className="screen-title">New trip</h2>
      <Field label="Name">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </Field>
      <Field label="Destination">
        <input
          value={form.destination}
          onChange={(e) => setForm({ ...form, destination: e.target.value })}
          placeholder="Optional"
        />
      </Field>
      <div className="grid2">
        <Field label="Start">
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            required
          />
        </Field>
        <Field label="End">
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            required
          />
        </Field>
      </div>
      <TimezoneField
        label="Home timezone"
        value={form.homeTimezone}
        onChange={(tz) => setForm({ ...form, homeTimezone: tz })}
      />
      <p className="muted tiny">
        Used to group the trip in your list and to decide when to label an event with its own zone.
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="actions">
        <button disabled={busy}>Create trip</button>
        {/* A button, not a bare link: an action row of one filled control and
            one underlined word reads as a form on a web page (BRAND.md §6). */}
        <Link className="btn secondary" to="/">
          Cancel
        </Link>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- detail -- */

/**
 * Loads a trip and its timeline together.
 *
 * Shared by the trip screen and its settings screen so that navigating between
 * them does not re-derive the same two requests in two different shapes.
 */
function useTrip(tripId: string) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadTrip>> | null>(null);
  const [timeline, setTimeline] = useState<Awaited<ReturnType<typeof loadTimeline>> | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!user) return;
    void Promise.all([loadTrip(tripId, user.id), loadTimeline(tripId, user.id)])
      .then(([d, t]) => {
        setDetail(d);
        setTimeline(t);
      })
      .catch((e: unknown) => {
        setError(
          e instanceof ApiError && e.status === 404
            ? 'That trip does not exist, or you are not a member of it.'
            : 'Could not load this trip, and nothing is saved on this device yet.',
        );
      });
  }, [tripId, user]);

  useEffect(load, [load]);
  return { detail, timeline, error, reload: load, userId: user?.id };
}

export function TripDetailPage() {
  const { tripId = '' } = useParams();
  const { detail, timeline, error } = useTrip(tripId);
  const [adding, setAdding] = useState(false);
  const closeSheet = useCallback(() => setAdding(false), []);
  const hour12 = useHour12();

  if (error) return <p className="error">{error}</p>;
  if (!detail || !timeline) return <Skeleton rows={4} label="Loading this trip" />;

  const stale = detail.stale || timeline.stale;
  const trip = detail.data.trip;
  const status = tripStatus(trip);

  return (
    <>
      {stale && <StaleBanner savedAt={timeline.savedAt ?? detail.savedAt} />}

      <section className="screen-head">
        <div className="top">
          <div className="grow">
            <h2 className="screen-title">{trip.name}</h2>
            <p className="meta">
              {trip.destination !== null && trip.destination !== '' ? `${trip.destination} · ` : ''}
              {formatRange(trip.startDate, trip.endDate)}
            </p>
          </div>
          <Link className="btn secondary" to={`/trips/${tripId}/settings`}>
            <ManageIcon />
            Manage
          </Link>
        </div>
        <span className={`status ${status.tone}`}>{status.text}</span>
        <Tallies items={timeline.data} />
      </section>

      {/* One primary action. Three side-by-side "+ Flight / + Stay / + Activity"
          buttons made the user pick a type before deciding to add anything. */}
      <button className="block" onClick={() => setAdding(true)}>
        <PlusIcon size={18} />
        Add to trip
      </button>

      <Issues items={timeline.data} trip={trip} />

      <Timeline items={timeline.data} homeTimezone={trip.homeTimezone} hour12={hour12} />

      {adding && (
        <Sheet title="Add to trip" onClose={closeSheet}>
          <div className="sheet-options">
            {ADD_OPTIONS.map((option) => (
              <Link
                key={option.to}
                className={`sheet-option kind-${option.kind}`}
                to={`/trips/${tripId}/${option.to}`}
                onClick={closeSheet}
              >
                <KindChip kind={option.kind} mode={option.mode} size="lg" />
                <span>
                  <span className="label">{option.label}</span>
                  <span className="sub">{option.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

/* -------------------------------------------------------------- settings -- */

/**
 * People, reminders and deletion.
 *
 * They used to sit below the timeline on the trip screen, which meant the trip
 * screen ended in a delete button — a settings page pretending to be a view
 * (BRAND.md §6b).
 */
export function TripSettingsPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const { detail, error, reload, userId } = useTrip(tripId);

  if (error) return <p className="error">{error}</p>;
  if (!detail) return <Skeleton rows={3} label="Loading trip settings" />;

  const trip = detail.data.trip;
  const me = detail.data.members.find((m) => m.userId === userId);

  return (
    <>
      <Link className="btn secondary backlink" to={`/trips/${tripId}`}>
        <BackIcon />
        {trip.name}
      </Link>

      <h2 className="screen-title">Trip settings</h2>

      <h2>Notifications</h2>
      <NotificationSettings tripId={tripId} enabled={me?.remindersEnabled !== 'false'} />

      <h2>People</h2>
      {detail.data.members.map((m) => (
        <div className="card" key={m.userId}>
          <div className="row">
            <span className="grow">{m.email}</span>
            <span className="zone">{m.role}</span>
          </div>
        </div>
      ))}
      {trip.role === 'owner' && <InviteBox tripId={tripId} onDone={reload} />}

      {trip.role === 'owner' && (
        <>
          <h2>Danger zone</h2>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              Deleting removes the trip for everyone on it, along with every flight, stay and
              activity. It cannot be undone.
            </p>
            <div className="actions" style={{ marginTop: 0 }}>
              <button
                className="danger"
                onClick={() => {
                  if (!confirm(`Delete "${trip.name}" and everything on it? This cannot be undone.`))
                    return;
                  void api.delete(`/trips/${tripId}`).then(() => navigate('/', { replace: true }));
                }}
              >
                Delete trip
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function InviteBox({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        void api
          .post(`/trips/${tripId}/invite`, { email })
          .then(() => {
            setSent(email);
            setEmail('');
            onDone();
          })
          .catch((err: unknown) =>
            setError(err instanceof ApiError ? err.message : 'Could not send the invitation.'),
          );
      }}
    >
      <Field label="Invite someone by email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      {sent !== '' && <p className="muted tiny">Invitation sent to {sent}. It expires in 7 days.</p>}
      <ErrorText>{error}</ErrorText>
      <div className="actions">
        <button className="secondary">Send invitation</button>
      </div>
    </form>
  );
}
