import { instantToLocal, zoneAbbreviation, type TimelineItem } from '@travel/shared';
import { Link } from 'react-router-dom';

const ICON: Record<TimelineItem['kind'], string> = {
  flight: '✈',
  lodging: '⌂',
  activity: '◆',
};

/**
 * Groups by the **local calendar day of each event's own zone**, not the trip's.
 *
 * A red-eye that leaves on the 10th and lands on the 11th belongs under the day
 * the traveller experiences it, and using one zone for the whole trip puts
 * events under the wrong heading exactly when the trip crosses zones — which is
 * the case this app exists for.
 */
function dayOf(item: TimelineItem): string {
  return instantToLocal(item.startAt, item.startTimezone).slice(0, 10);
}

function timeOf(instant: string, zone: string): string {
  return instantToLocal(instant, zone).slice(11);
}

export function Timeline({ items, homeTimezone }: { items: TimelineItem[]; homeTimezone: string }) {
  if (items.length === 0) {
    return <p className="empty">Nothing on this trip yet. Add a flight, somewhere to stay, or something to do.</p>;
  }

  const days = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const key = dayOf(item);
    days.set(key, [...(days.get(key) ?? []), item]);
  }

  return (
    <>
      {[...days.entries()].map(([day, dayItems]) => (
        <section className="day" key={day}>
          <h3>
            {new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h3>
          {dayItems.map((item) => (
            <Event key={`${item.kind}:${item.id}`} item={item} homeTimezone={homeTimezone} />
          ))}
        </section>
      ))}
    </>
  );
}

function Event({ item, homeTimezone }: { item: TimelineItem; homeTimezone: string }) {
  const start = timeOf(item.startAt, item.startTimezone);
  const end = item.endAt && item.endTimezone ? timeOf(item.endAt, item.endTimezone) : null;

  // The zone badge appears only when it differs from the trip's home zone —
  // labelling every row would be noise on a trip that never leaves one zone.
  const showStartZone = item.startTimezone !== homeTimezone;
  const showEndZone = item.endTimezone !== null && item.endTimezone !== item.startTimezone;

  return (
    <Link className="card link" to={`/trips/${item.tripId}/${item.kind}/${item.id}`}>
      <div className="event">
        <div className="when">
          <div className="time">
            {start}
            {showStartZone && <span className="zone">{zoneAbbreviation(item.startAt, item.startTimezone)}</span>}
          </div>
          {end !== null && (
            <div className="muted tiny mono">
              → {end}
              {showEndZone && item.endTimezone !== null && (
                <span className="zone">{zoneAbbreviation(item.endAt!, item.endTimezone)}</span>
              )}
            </div>
          )}
        </div>
        <div className="body">
          <div className="title">
            <span className="kind">{ICON[item.kind]}</span>
            {item.title}
          </div>
          {item.subtitle !== null && item.subtitle !== '' && <div className="muted">{item.subtitle}</div>}
          {item.confirmationCode !== null && (
            <div className="muted tiny mono">Ref {item.confirmationCode}</div>
          )}
        </div>
      </div>
    </Link>
  );
}
