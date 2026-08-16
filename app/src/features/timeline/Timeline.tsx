import { instantToLocal, zoneLabel, type TimelineItem } from '@travel/shared';
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
          {/* A list, so assistive tech can say how many events the day holds
              and let the user move between them as items. */}
          <ul className="events">
            {dayItems.map((item) => (
              <li className={`event-item kind-${item.kind}`} key={`${item.kind}:${item.id}`}>
                <Event item={item} homeTimezone={homeTimezone} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Event({ item, homeTimezone }: { item: TimelineItem; homeTimezone: string }) {
  const startLocal = instantToLocal(item.startAt, item.startTimezone);
  const endLocal =
    item.endAt !== null && item.endTimezone !== null ? instantToLocal(item.endAt, item.endTimezone) : null;

  const start = startLocal.slice(11);
  const end = endLocal?.slice(11) ?? null;

  /**
   * A badge appears only when the zone differs from the **trip's** home zone.
   * Both ends are compared against the same reference: comparing the end
   * against the start instead labelled a Lisbon arrival on a Lisbon trip just
   * because it departed from London, which is noise.
   */
  const showStartZone = item.startTimezone !== homeTimezone;
  const showEndZone = item.endTimezone !== null && item.endTimezone !== homeTimezone;

  /**
   * An end on a different calendar day needs its date shown. A hotel rendered
   * as "15:00 → 11:00" reads as a six-hour stay when it is eight nights, and an
   * overnight flight has the same problem.
   */
  const endOnAnotherDay = endLocal !== null && endLocal.slice(0, 10) !== startLocal.slice(0, 10);
  const endDate =
    endOnAnotherDay && endLocal !== null
      ? new Date(`${endLocal.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        })
      : null;

  return (
    <Link className="card link" to={`/trips/${item.tripId}/${item.kind}/${item.id}`}>
      <div className="event">
        <div className="when">
          <div className="time">{start}</div>
          {showStartZone && <div className="zone">{zoneLabel(item.startTimezone)}</div>}
          {end !== null && (
            <div className="until mono">
              → {end}
              {endDate !== null && <span className="endday"> {endDate}</span>}
            </div>
          )}
          {end !== null && showEndZone && <div className="zone">{zoneLabel(item.endTimezone!)}</div>}
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
