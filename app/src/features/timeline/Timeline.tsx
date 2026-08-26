import { formatCalendarDate, instantToLocal, zoneLabel, type TimelineItem } from '@travel/shared';
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
 * The **local calendar day of an event's own zone**, not the trip's.
 *
 * A red-eye that leaves on the 10th and lands on the 11th belongs under the day
 * the traveller experiences it, and using one zone for the whole trip puts
 * events under the wrong heading exactly when the trip crosses zones — which is
 * the case this app exists for.
 */
function dayIn(instant: string, timeZone: string): string {
  return instantToLocal(instant, timeZone).slice(0, 10);
}

/** Which end of a booking a row shows. */
type Occurrence = 'whole' | 'check-in' | 'check-out';

/**
 * A row on the timeline, which is not the same thing as an entity.
 *
 * A stay is one booking but two things the traveller has to do, and they can be
 * a week apart. Rendered as a single row it appears only under the check-in
 * day: on the morning you actually have to be out of the room, the timeline
 * says nothing at all. So a stay expands into a check-in row and a check-out
 * row, each sitting at its own end of the booking.
 *
 * **The expansion is here, at render, and deliberately not in `getTimeline`.**
 * `TimelineItem` is the entity, and three things count on that: `Tallies` counts
 * one hotel as one stay, `overlaps` compares whole spans, and `unbookedNights`
 * tests each night of the trip against a booking's full length. Split rows
 * reaching them would report one hotel as two stays and every night of it as
 * unbooked. What splits is the view, not the data.
 *
 * Segments are left alone for now. A red-eye landing the next day has the same
 * gap and would take the same treatment, but it was not asked for and a flight
 * is one continuous thing in a way a hotel booking is not.
 */
type Row = {
  item: TimelineItem;
  occurrence: Occurrence;
  /** The instant this row sits at — a check-out row sits at the booking's end. */
  at: string;
  timezone: string;
  place: string | null;
};

function rowsFor(item: TimelineItem): Row[] {
  const whole: Row = {
    item,
    occurrence: 'whole',
    at: item.startAt,
    timezone: item.startTimezone,
    place: item.startPlace,
  };

  // `endAt` is required of a stay by the schema, but the cache can hold a row
  // written by an older build, so this is guarded rather than asserted.
  if (item.kind !== 'lodging' || item.endAt === null || item.endTimezone === null) return [whole];

  // A day-use booking that checks out the same day it checked in stays one row:
  // two rows on one afternoon is noise, and the split exists to put a reminder
  // on a *later* day.
  if (dayIn(item.startAt, item.startTimezone) === dayIn(item.endAt, item.endTimezone)) {
    return [whole];
  }

  return [
    { ...whole, occurrence: 'check-in' },
    {
      item,
      occurrence: 'check-out',
      at: item.endAt,
      timezone: item.endTimezone,
      place: item.endPlace,
    },
  ];
}

/** Nights covered, counted in local calendar days at each end of the booking. */
function nightsBetween(inDay: string, outDay: string): number {
  return Math.round(
    (Date.parse(`${outDay}T00:00:00Z`) - Date.parse(`${inDay}T00:00:00Z`)) / 86_400_000,
  );
}

/** The verb a split row leads with. A whole row is still just its own title. */
const TITLE_PREFIX: Record<Occurrence, string> = {
  whole: '',
  'check-in': 'Check in — ',
  'check-out': 'Check out — ',
};

export function Timeline({ items, homeTimezone }: { items: TimelineItem[]; homeTimezone: string }) {
  if (items.length === 0) {
    return <p className="empty">Nothing on this trip yet. Add a flight, somewhere to stay, or something to do.</p>;
  }

  /*
   * Re-sorted, because a check-out row belongs at the far end of its booking
   * rather than beside the check-in the server sorted it next to. Ties are
   * broken the same way the server breaks them — instant, kind, id — so the
   * order stays stable across reloads, with the occurrence last so a stay's two
   * rows never swap.
   */
  const rows = items
    .flatMap(rowsFor)
    .sort(
      (x, y) =>
        x.at.localeCompare(y.at) ||
        x.item.kind.localeCompare(y.item.kind) ||
        x.item.id.localeCompare(y.item.id) ||
        x.occurrence.localeCompare(y.occurrence),
    );

  const days = new Map<string, Row[]>();
  for (const row of rows) {
    const key = dayIn(row.at, row.timezone);
    days.set(key, [...(days.get(key) ?? []), row]);
  }

  return (
    <>
      {[...days.entries()].map(([day, dayRows]) => (
        <section className="day" key={day}>
          <h3>
            {formatCalendarDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {/* A list, so assistive tech can say how many events the day holds
              and let the user move between them as items. */}
          <ul className="events">
            {dayRows.map((row) => (
              <li
                className={`event-item kind-${row.item.kind}`}
                key={`${row.item.kind}:${row.item.id}:${row.occurrence}`}
              >
                <Event row={row} homeTimezone={homeTimezone} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Event({ row, homeTimezone }: { row: Row; homeTimezone: string }) {
  const { item, occurrence } = row;
  /** A split row shows one end of the booking; the other end has a row of its own. */
  const split = occurrence !== 'whole';

  const startLocal = instantToLocal(item.startAt, item.startTimezone);
  const endLocal =
    item.endAt !== null && item.endTimezone !== null ? instantToLocal(item.endAt, item.endTimezone) : null;

  // For a whole row this is the start, unchanged: `row.at` and `row.timezone`
  // are the item's own start unless the row was split off the other end.
  const start = instantToLocal(row.at, row.timezone).slice(11);
  const end = split ? null : (endLocal?.slice(11) ?? null);

  /**
   * How long the stay runs, shown on the check-in row.
   *
   * The single row used to carry "15:00 → 11:00 18 Sep", which said both when
   * to arrive and how long it ran. Splitting moves the check-out to its own day
   * and would otherwise take the length with it, so it is stated here in the
   * form a traveller actually thinks in.
   */
  const nights =
    occurrence === 'check-in' && item.endAt !== null && item.endTimezone !== null
      ? nightsBetween(
          dayIn(item.startAt, item.startTimezone),
          dayIn(item.endAt, item.endTimezone),
        )
      : null;

  /**
   * A badge appears only when the zone differs from the **trip's** home zone.
   * Both ends are compared against the same reference: comparing the end
   * against the start instead labelled a Lisbon arrival on a Lisbon trip just
   * because it departed from London, which is noise.
   */
  const showStartZone = row.timezone !== homeTimezone;
  /**
   * The end is badged only when it is a *different* zone from the start as well
   * as from home. A train from Ottawa to Toronto Union is one zone end to end,
   * and badging both ends said the same thing twice — the badge exists to warn
   * that a time is not on the trip's clock, not to restate the route.
   */
  const showEndZone =
    !split &&
    item.endTimezone !== null &&
    item.endTimezone !== homeTimezone &&
    item.endTimezone !== item.startTimezone;

  /**
   * An end on a different calendar day needs its date shown. A hotel rendered
   * as "15:00 → 11:00" reads as a six-hour stay when it is eight nights, and an
   * overnight flight has the same problem.
   */
  const endOnAnotherDay =
    !split && endLocal !== null && endLocal.slice(0, 10) !== startLocal.slice(0, 10);
  const endDate =
    endOnAnotherDay && endLocal !== null
      ? formatCalendarDate(endLocal.slice(0, 10), { day: 'numeric', month: 'short' })
      : null;

  /**
   * Nothing to offer on a check-out row: you are standing in the building. It
   * also keeps one Directions link per stay rather than two identical ones days
   * apart, which is what a screen reader's list of links would have to read out.
   */
  const directions = occurrence === 'check-out' ? null : directionsUrl(item.address, PLATFORM);

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
    <>
      {/*
        The chip is a node on the day's spine rather than a column between two
        others. It sits outside the card, on the rule, and is decorative to
        assistive tech — the kind is said in the title below, as it always was.
      */}
      <span className="event-node" aria-hidden="true">
        <KindChip kind={item.kind} mode={item.mode} />
      </span>
      <div className="card event-card">
        {/*
          Times lead the row instead of occupying a fixed column. The trade is
          deliberate and was made with the alternative on screen: the column
          scanned better, and this gives the content its full width and gives
          the zone badge room to say "Los Angeles" rather than clipping it.
        */}
        <div className="event-meta">
          <span className="time mono">{start}</span>
          {end !== null && (
            <span className="until mono">
              → {end}
              {endDate !== null && <span className="endday"> {endDate}</span>}
            </span>
          )}
          {nights !== null && (
            <span className="until">
              {nights} {nights === 1 ? 'night' : 'nights'}
            </span>
          )}
          {showStartZone && <Zone place={row.place ?? zoneLabel(row.timezone)} />}
          {end !== null && showEndZone && (
            <Zone place={item.endPlace ?? zoneLabel(item.endTimezone!)} />
          )}
        </div>
        <div className="body">
          <div className="title">
            <Link className="event-open" to={`/trips/${item.tripId}/${item.kind}/${item.id}`}>
              {/* The chip is decorative to assistive tech, so the kind is said
                  here. It used to be a bare `✈` character, which a screen reader
                  announces inconsistently and sometimes not at all. */}
              <span className="visually-hidden">{KIND_LABEL[item.kind]}: </span>
              {TITLE_PREFIX[occurrence]}
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
    </>
  );
}

/**
 * The badge says which clock a time is on, and it is shown only when that zone
 * differs from the trip's.
 *
 * The pill's shape and its position beside the time carry that for a sighted
 * reader; in the accessibility tree it was a bare place name with no such cue.
 * Since today's change resolves a *city*, a stay in Paris announced as
 * "15:00 → 11:00 Mar 6 Paris. Stay: Hotel Lutetia. 45 Boulevard Raspail,
 * Paris" — the same word twice, once meaning the clock and once the address,
 * with nothing to tell them apart.
 *
 * The qualifier is hidden text rather than an `aria-label` deliberately. This
 * is rendered content, not an accessible name, so element boundaries give a
 * pause and it reads as "Paris time" — it is not the case where a
 * visually-hidden suffix collapsed into "Directionsto Hotel Lutetia", which
 * happens only in name computation.
 */
function Zone({ place }: { place: string }) {
  return (
    <span className="zone">
      {place}
      <span className="visually-hidden"> time</span>
    </span>
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
