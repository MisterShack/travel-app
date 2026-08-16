import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TripSummary } from '@travel/shared';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/useAuth';
import { ErrorText, Field, StaleBanner } from '@/components/Bits';
import { loadTimeline, loadTrip, loadTrips, type Loaded } from '@/data/repository';
import { Timeline } from '@/features/timeline/Timeline';
import { Issues } from '@/features/timeline/Issues';
import { NotificationSettings } from '@/features/notify/NotificationSettings';
import { TimezoneField } from '@/features/timeline/AirportField';

const guessZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * A date range, rendered in the reader's locale. Noon UTC avoids the classic
 * off-by-one where parsing a bare date as midnight UTC shows the previous day
 * to anyone west of Greenwich.
 */
function formatRange(startDate: string, endDate: string): string {
  const fmt = (d: string, withYear: boolean) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(startDate, false)} – ${fmt(endDate, true)}`;
}

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
  if (!state) return <p className="muted">Loading…</p>;

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = state.data.filter((t) => t.endDate >= now);
  const past = state.data.filter((t) => t.endDate < now);

  return (
    <>
      {state.stale && <StaleBanner savedAt={state.savedAt} />}
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="btn" to="/trips/new">
          New trip
        </Link>
      </div>

      {state.data.length === 0 && <p className="empty">No trips yet.</p>}
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
  const range = formatRange(trip.startDate, trip.endDate);

  return (
    <Link className="card link" to={`/trips/${trip.id}`}>
      <div className="row">
        <div className="grow">
          <div className="title">{trip.name}</div>
          <div className="muted">
            {trip.destination !== null && trip.destination !== '' ? `${trip.destination} · ` : ''}
            {range}
          </div>
        </div>
        {trip.memberCount > 1 && <span className="muted tiny">{trip.memberCount} people</span>}
      </div>
    </Link>
  );
}

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
      <h2>New trip</h2>
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
        <Link to="/">Cancel</Link>
      </div>
    </form>
  );
}

export function TripDetailPage() {
  const { tripId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
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

  if (error) return <p className="error">{error}</p>;
  if (!detail || !timeline) return <p className="muted">Loading…</p>;

  const stale = detail.stale || timeline.stale;
  const trip = detail.data.trip;

  return (
    <>
      {stale && <StaleBanner savedAt={timeline.savedAt ?? detail.savedAt} />}
      <div className="row">
        <div className="grow">
          <h2 className="screen-title">{trip.name}</h2>
          <p className="muted" style={{ marginTop: -4 }}>
            {trip.destination !== null && trip.destination !== '' ? `${trip.destination} · ` : ''}
            {formatRange(trip.startDate, trip.endDate)}
          </p>
        </div>
      </div>

      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="btn secondary" to={`/trips/${tripId}/flight/new`}>
          + Flight
        </Link>
        <Link className="btn secondary" to={`/trips/${tripId}/lodging/new`}>
          + Stay
        </Link>
        <Link className="btn secondary" to={`/trips/${tripId}/activity/new`}>
          + Activity
        </Link>
      </div>

      <Issues items={timeline.data} trip={trip} />

      <Timeline items={timeline.data} homeTimezone={trip.homeTimezone} />

      <h2>Notifications</h2>
      <NotificationSettings
        tripId={tripId}
        enabled={
          detail.data.members.find((m) => m.userId === user?.id)?.remindersEnabled !== 'false'
        }
      />

      <h2>People</h2>
      {detail.data.members.map((m) => (
        <div className="card" key={m.userId}>
          <div className="row">
            <span className="grow">{m.email}</span>
            <span className="muted tiny">{m.role}</span>
          </div>
        </div>
      ))}
      {trip.role === 'owner' && <InviteBox tripId={tripId} onDone={load} />}

      {trip.role === 'owner' && (
        <div className="actions">
          <button
            className="danger"
            onClick={() => {
              if (!confirm(`Delete "${trip.name}" and everything on it? This cannot be undone.`)) return;
              void api.delete(`/trips/${tripId}`).then(() => navigate('/', { replace: true }));
            }}
          >
            Delete trip
          </button>
        </div>
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
