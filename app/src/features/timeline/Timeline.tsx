import { instantToLocal, zoneLabel, type TimelineItem } from '@travel/shared';
import { Link } from 'react-router-dom';
import { KindChip } from '@/components/Icons';
import { KIND_LABEL } from '@/components/kinds';
import { directionsUrl, mapsPlatform } from './directions';

/**
 * Resolved once. The user-agent does not change while the app is open, and this
 * only chooses a URL scheme.
 */
const PLATFORM = mapsPlatform(typeof navigator === 'undefined' ? '' : navigator.userAgent);

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
  /**
   * The end is badged only when it is a *different* zone from the start as well
   * as from home. A train from Ottawa to Toronto Union is one zone end to end,
   * and badging both ends said the same thing twice — the badge exists to warn
   * that a time is not on the trip's clock, not to restate the route.
   */
  const showEndZone =
    item.endTimezone !== null &&
    item.endTimezone !== homeTimezone &&
    item.endTimezone !== item.startTimezone;

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

  const directions = directionsUrl(item.address, PLATFORM);

  /**
   * The card used to be one big `<Link>`. A second action inside it would have
   * been an anchor inside an anchor — invalid, and it breaks tab order and
   * activation in ways that vary by browser.
   *
   * So the title carries the link and stretches its hit area over the whole
   * card with a pseudo-element, and Directions sits above that. Two sibling
   * links, one card, nothing nested.
   */
  return (
    <div className="card event-card">
      <div className="event">
        <div className="when">
          <div className="time">{start}</div>
          {showStartZone && (
            <div className="zone">{item.startPlace ?? zoneLabel(item.startTimezone)}</div>
          )}
          {end !== null && (
            <div className="until mono">
              → {end}
              {endDate !== null && <span className="endday">{endDate}</span>}
            </div>
          )}
          {end !== null && showEndZone && (
            <div className="zone">{item.endPlace ?? zoneLabel(item.endTimezone!)}</div>
          )}
        </div>
        <KindChip kind={item.kind} mode={item.mode} />
        <div className="body">
          <div className="title">
            <Link className="event-open" to={`/trips/${item.tripId}/${item.kind}/${item.id}`}>
              {/* The chip is decorative to assistive tech, so the kind is said
                  here. It used to be a bare `✈` character, which a screen reader
                  announces inconsistently and sometimes not at all. */}
              <span className="visually-hidden">{KIND_LABEL[item.kind]}: </span>
              {item.title}
            </Link>
          </div>
          {item.subtitle !== null && item.subtitle !== '' && <div className="muted">{item.subtitle}</div>}
          {item.confirmationCode !== null && (
            <div className="muted tiny mono">Ref {item.confirmationCode}</div>
          )}
          {directions !== null && <Directions href={directions} title={item.title} />}
        </div>
      </div>
    </div>
  );
}

function Directions({ href, title }: { href: string; title: string }) {
  /**
   * A new tab for a web map, so the itinerary is not navigated away from — but
   * never for `geo:`, where the browser hands off to an app and `_blank` leaves
   * a dead tab behind on the way.
   */
  const external = href.startsWith('http');

  return (
    <a
      className="directions"
      href={href}
      /* Every card would otherwise offer a link named exactly "Directions",
         which is no help to anyone listing the links on a screen.
         An `aria-label` rather than a visually-hidden suffix: name computation
         collapses the leading space, so " to Hotel X" appended to the visible
         text announced as "Directionsto Hotel X". The visible word is still
         contained in the accessible name, which is what WCAG 2.5.3 asks. */
      aria-label={`Directions to ${title}`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      Directions
    </a>
  );
}
