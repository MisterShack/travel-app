import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  formatCalendarDate,
  formatTimeOfDay,
  type TimelineItem,
  type TripSummary,
} from '@travel/shared';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/useAuth';
import { ErrorText, Field, ScreenBar, Sheet, Skeleton, StaleBanner } from '@/components/Bits';
import { KindChip, ManageIcon, PlusIcon } from '@/components/Icons';
import { countedKindLabel } from '@/components/kinds';
import { hasEnded, tripStatus } from '@/features/trips/status';
import { useHour12 } from '@/prefs/useHour12';
import { useWide } from '@/components/useWide';
import {
  cachedNextEvent,
  loadTimeline,
  loadTrip,
  loadTrips,
  type Loaded,
} from '@/data/repository';
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
  const { pathname } = useLocation();
  const [state, setState] = useState<Loaded<TripSummary[]> | null>(null);
  const [error, setError] = useState('');

  /*
   * Re-read on every navigation, not only on mount.
   *
   * At desktop width this list is a permanent pane and never unmounts, so a
   * mount-only fetch left it showing trips that no longer existed: deleting one
   * navigated to `/` and the row stayed until a reload, and creating one
   * navigated to the new trip without ever adding it. On a phone the same code
   * looked correct only because the screen was being rebuilt each time.
   *
   * This is the lesson `InboxProvider` already records, one screen over: a value
   * that must change without its component being rebuilt has to be told to, and
   * a route change is the cheapest honest signal available. Both mutations
   * navigate, so there is nothing left to catch.
   */
  useEffect(() => {
    if (!user) return;
    void loadTrips(user.id)
      .then(setState)
      .catch(() => setError('Could not load your trips, and nothing is saved on this device yet.'));
  }, [user, pathname]);

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

/**
 * What is next on this trip, from the cache alone.
 *
 * Absent rather than wrong when the trip has never been opened online: there is
 * nothing cached to read, and inventing a request per card would make the one
 * screen that must open instantly the slowest one in the app.
 */
function useNextUp(tripId: string): TimelineItem | null {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [next, setNext] = useState<TimelineItem | null>(null);

  /*
   * Re-read on every navigation, not only on mount.
   *
   * At desktop width this list never unmounts — so without the pathname here,
   * opening a trip for the first time caches its timeline and the card beside
   * it goes on saying nothing until the page is reloaded. An IndexedDB read per
   * card per navigation is a rounding error against the request the navigation
   * itself just made.
   */
  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    void cachedNextEvent(tripId, user.id, Date.now()).then((item) => {
      if (live) setNext(item);
    });
    return () => {
      live = false;
    };
  }, [tripId, user, pathname]);

  return next;
}

function NextUp({ item, hour12 }: { item: TimelineItem; hour12: boolean }) {
  const day = formatCalendarDate(item.startLocal.slice(0, 10), { weekday: 'long' });

  return (
    <p className="next-up">
      <KindChip kind={item.kind} mode={item.mode} size="sm" />
      {/* One line, ellipsised: this is a glance, and a card that grows to three
          lines for a long restaurant name stops being scannable. */}
      <span className="what">
        Next: {item.title} · {formatTimeOfDay(item.startLocal, hour12)} {day}
      </span>
    </p>
  );
}

function TripCard({ trip }: { trip: TripSummary }) {
  const status = tripStatus(trip);
  const hour12 = useHour12();
  const next = useNextUp(trip.id);

  return (
    /*
     * A NavLink rather than a Link, for `aria-current="page"` alone: at desktop
     * width this list stands permanently beside the trip it opens, and a list
     * that does not say which of its rows the pane is showing is a list of
     * links to nowhere in particular. It costs nothing on a phone, where the
     * list is never on screen at the same time as the trip.
     */
    <NavLink className="card link" to={`/trips/${trip.id}`}>
      <div className="row">
        <div className="grow">
          <div className="title">{trip.name}</div>
          <div className="muted">
            {trip.destination !== null && trip.destination !== '' ? `${trip.destination} · ` : ''}
            {formatRange(trip.startDate, trip.endDate)}
          </div>
          {next !== null && <NextUp item={next} hour12={hour12} />}
          <span className={`status ${status.tone}`}>{status.text}</span>
        </div>
        {trip.memberCount > 1 && <span className="muted tiny">{trip.memberCount} people</span>}
      </div>
    </NavLink>
  );
}

/**
 * What the detail pane shows before a trip has been chosen.
 *
 * Only reachable at desktop width: on a phone `/` is the list itself, and there
 * is no second pane to be empty.
 */
export function ChooseTripPane() {
  return (
    <div className="pane-empty">
      <p>No trip open.</p>
      <p className="muted">Choose one from the list, or start a new one.</p>
    </div>
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
    // Guarded rather than disabled — see the note on the event form's submit.
    if (busy) return;
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
    <>
    {/* The tab bar is not rendered on this screen, so this is the only way
        back — and the first thing in the tab order, which is where a way out
        belongs. */}
    <ScreenBar to="/" label="Back to trips" />
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
      <p className="visually-hidden saving-live" role="status">
        {busy ? 'Creating your trip…' : ''}
      </p>

      <div className="actions pinned">
        <button aria-disabled={busy}>Create trip</button>
        {/* A button, not a bare link: an action row of one filled control and
            one underlined word reads as a form on a web page (BRAND.md §6). */}
        <Link className="btn secondary" to="/">
          Cancel
        </Link>
      </div>
    </form>
    </>
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
  const wide = useWide();

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
          {/* Where there is a header with room in it, the action lives in the
              header. The floating button below is the phone's answer to the
              same problem and they are never both on screen. */}
          {wide && (
            <button aria-label="Add to trip" onClick={() => setAdding(true)}>
              <PlusIcon size={18} />
              Add
            </button>
          )}
        </div>
        <span className={`status ${status.tone}`}>{status.text}</span>
        <Tallies items={timeline.data} />
      </section>

      <Issues items={timeline.data} trip={trip} />

      <Timeline items={timeline.data} homeTimezone={trip.homeTimezone} hour12={hour12} />

      {/*
        The phone's Add.

        It used to be a full-width block between the trip header and the
        timeline, which put the first event of the trip at the fold on a 390px
        screen — a screen whose whole job is showing the timeline. Adding is
        frequent enough to stay reachable from anywhere on the page and not
        important enough to take a screen's width to say so.

        Last in the DOM on purpose: it is the last thing a keyboard user reaches
        rather than something they pass through on the way to the itinerary.
      */}
      {!wide && (
        <>
          <button className="fab" aria-label="Add to trip" onClick={() => setAdding(true)}>
            <PlusIcon size={20} />
            Add
          </button>
          {/* Something for the last card to scroll past. A floating button that
              permanently covers the final event of a trip has taken away the
              one row a person scrolled to the bottom to read. */}
          <div className="fab-clearance" aria-hidden="true" />
        </>
      )}

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
      {/* The same bar as every other pushed screen. This was the one screen
          that had a way back before the bar existed, and so ended up the only
          one without it (BRAND.md §6b). */}
      <ScreenBar to={`/trips/${tripId}`} label="Back to trip" title={trip.name} />

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
