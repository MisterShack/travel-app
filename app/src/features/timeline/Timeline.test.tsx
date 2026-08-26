import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineItem } from '@travel/shared';
import { Timeline } from './Timeline';

function item(over: Partial<TimelineItem>): TimelineItem {
  return {
    kind: 'activity',
    id: 'a1',
    tripId: 't1',
    title: 'Thing',
    subtitle: null,
    address: null,
    startAt: '2026-09-10T12:00:00.000Z',
    startLocal: '2026-09-10T13:00',
    startTimezone: 'Europe/Lisbon',
    startPlace: null,
    mode: null,
    origin: null,
    destination: null,
    endAt: null,
    endLocal: null,
    endTimezone: null,
    endPlace: null,
    confirmationCode: null,
    notes: null,
    source: 'manual',
    ...over,
  };
}

const draw = (items: TimelineItem[], home = 'Europe/Lisbon') =>
  render(
    <MemoryRouter>
      <Timeline items={items} homeTimezone={home} />
    </MemoryRouter>,
  );

describe('Timeline', () => {
  it('renders each event at its own local time, not the trip home time', () => {
    // A 23:00Z departure is 00:00 the next day in Lisbon but 19:00 the same day
    // in New York. Showing the traveller the destination clock is the point.
    draw([
      item({
        id: 'f1',
        kind: 'segment',
        title: 'TAP TP1233',
        startAt: '2026-09-10T23:00:00.000Z',
        startTimezone: 'America/New_York',
      }),
    ]);
    expect(screen.getByText('19:00')).toBeInTheDocument();
  });

  it('badges a zone only when it differs from the trip home zone', () => {
    const { unmount } = draw([item({ startTimezone: 'Europe/Lisbon' })], 'Europe/Lisbon');
    expect(screen.queryByText('Lisbon')).toBeNull();
    unmount();

    draw([item({ startTimezone: 'America/New_York' })], 'Europe/Lisbon');
    expect(screen.getByText('New York')).toBeInTheDocument();
  });

  it('names the place, not the zone, when the two differ', () => {
    /*
     * Ottawa's IANA zone is America/Toronto — as is Montreal's, Detroit's and
     * Iqaluit's. Labelling a YOW arrival from its zone alone put "Toronto" on a
     * flight to Ottawa, which reads as the wrong city rather than as a
     * timezone. Reported from a real WestJet import, 2026-08-16.
     */
    draw(
      [
        item({
          id: 'f1',
          kind: 'segment',
          startTimezone: 'America/Winnipeg',
          startPlace: 'Winnipeg',
          endAt: '2026-09-10T14:40:00.000Z',
          endTimezone: 'America/Toronto',
          endPlace: 'Ottawa',
        }),
      ],
      'Europe/Lisbon',
    );
    expect(screen.getByText('Ottawa')).toBeInTheDocument();
    expect(screen.queryByText('Toronto')).toBeNull();
  });

  it('labels the badge with the city, not a UTC offset', () => {
    // In September both Europe/London and Europe/Lisbon render as "GMT+1"
    // through Intl's short name, so an offset badge gave two different zones an
    // identical label and stopped carrying any information.
    draw(
      [
        item({
          id: 'f1',
          kind: 'segment',
          startTimezone: 'Europe/London',
          endAt: '2026-09-10T12:00:00.000Z',
          endTimezone: 'Europe/Lisbon',
        }),
      ],
      'Europe/Lisbon',
    );
    expect(screen.getByText('London')).toBeInTheDocument();
    // The arrival is in the trip's own zone, so it needs no badge at all.
    expect(screen.queryByText('Lisbon')).toBeNull();
  });

  it('shows the date on an end that falls on another day', () => {
    // "15:00 -> 11:00" reads as a six-hour flight when it lands the next day.
    // Segments are not split, so the end date is still carried on the one row.
    draw([
      item({
        kind: 'segment',
        title: 'TAP TP442',
        mode: 'air',
        startAt: '2026-09-10T22:00:00.000Z',
        endAt: '2026-09-11T06:00:00.000Z',
        endTimezone: 'Europe/Lisbon',
      }),
    ]);
    expect(screen.getByText(/11 Sep|Sep 11/)).toBeInTheDocument();
  });

  it('groups events under the day of their own zone', () => {
    // 2026-09-10T23:30Z is the 10th in New York and the 11th in Lisbon. Grouped
    // by the trip's zone this lands under the wrong heading.
    draw([
      item({ id: 'a1', startAt: '2026-09-10T23:30:00.000Z', startTimezone: 'America/New_York' }),
    ]);
    // Locale-agnostic: the runner's default locale decides the field order.
    expect(screen.getByText(/September/)).toHaveTextContent(/\b10\b/);
  });

  it('shows an empty state rather than a blank screen', () => {
    draw([]);
    expect(screen.getByText(/Nothing on this trip yet/)).toBeInTheDocument();
  });
});

describe('journeys', () => {
  it('badges one zone, not the same zone twice', () => {
    // A train from Ottawa to Toronto Union is one zone end to end. Badging both
    // ends said the same thing twice; the badge warns that a time is not on the
    // trip's clock, it does not restate the route.
    draw(
      [
        item({
          id: 's1',
          kind: 'segment',
          mode: 'rail',
          startTimezone: 'America/Toronto',
          startPlace: 'Ottawa',
          endAt: '2026-09-10T17:00:00.000Z',
          endTimezone: 'America/Toronto',
          endPlace: 'Toronto Union',
        }),
      ],
      'Europe/Lisbon',
    );
    expect(screen.getByText('Ottawa')).toBeInTheDocument();
    expect(screen.queryByText('Toronto Union')).toBeNull();
  });
});

describe('Directions (PLAN-V3 §2, Phase 8)', () => {
  it('offers directions for a lodging with an address', () => {
    draw([item({ kind: 'lodging', title: 'Hotel Lutetia', address: '45 Bd Raspail, Paris' })]);
    // jsdom reports a desktop user-agent, so this is the web fallback.
    expect(screen.getByRole('link', { name: /Directions to Hotel Lutetia/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=45%20Bd%20Raspail%2C%20Paris',
    );
  });

  it('offers nothing when no address was recorded', () => {
    draw([item({ kind: 'activity', title: 'Wander about', address: null })]);
    expect(screen.queryByRole('link', { name: /Directions/ })).toBeNull();
  });

  it('offers nothing for a journey, whose endpoints are codes and station names', () => {
    // "YOW" is not an address and "Ottawa" is a city rather than the station in
    // it. Sending someone confidently to the wrong place is worse than nothing.
    draw([
      item({ kind: 'segment', mode: 'rail', title: 'VIA 55', origin: 'Ottawa', address: null }),
    ]);
    expect(screen.queryByRole('link', { name: /Directions/ })).toBeNull();
  });

  it('survives a cached item saved before the field existed', () => {
    /*
     * The offline cache stores raw JSON and never re-validates it, so an entry
     * written by an older build comes back with `address` absent rather than
     * null. That must render as "no directions", not as a link to an empty map.
     */
    const stale = item({ kind: 'lodging', title: 'Old Cache Hotel' });
    delete (stale as Partial<TimelineItem>).address;
    draw([stale]);
    expect(screen.queryByRole('link', { name: /Directions/ })).toBeNull();
    expect(screen.getByText('Old Cache Hotel')).toBeInTheDocument();
  });

  it('names each directions link by its place, so a list of links is usable', () => {
    draw([
      item({ id: 'l1', kind: 'lodging', title: 'Hotel One', address: 'One Street' }),
      item({ id: 'l2', kind: 'lodging', title: 'Hotel Two', address: 'Two Street' }),
    ]);
    expect(screen.getByRole('link', { name: /Directions to Hotel One/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Directions to Hotel Two/ })).toBeInTheDocument();
  });

  it('never nests the directions link inside the link that opens the event', () => {
    /*
     * The structural guarantee, asserted rather than trusted. The card used to
     * be one big <Link>; an anchor inside an anchor is invalid HTML and breaks
     * tab order and activation differently in every browser. This is the test
     * that fails if someone puts the card back the way it was.
     */
    const { container } = draw([
      item({ kind: 'lodging', title: 'Hotel Lutetia', address: '45 Bd Raspail, Paris' }),
    ]);
    expect(container.querySelector('a a')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });

  it('opens a web map in a new tab so the itinerary is not navigated away from', () => {
    draw([item({ kind: 'lodging', title: 'Hotel Lutetia', address: '45 Bd Raspail, Paris' })]);
    const link = screen.getByRole('link', { name: /Directions to/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

/**
 * A stay is one booking but two things to do, and they can be a week apart.
 * Rendered as one row it appeared only under the check-in day — on the morning
 * the traveller actually had to be out of the room, the timeline said nothing.
 */
describe('a stay splits into check-in and check-out', () => {
  const stay = (over: Partial<TimelineItem> = {}) =>
    item({
      kind: 'lodging',
      id: 'l1',
      title: 'Hotel Bairro Alto',
      address: 'Praça Luís de Camões, Lisboa',
      startAt: '2026-09-10T14:00:00.000Z',
      startLocal: '2026-09-10T15:00',
      startTimezone: 'Europe/Lisbon',
      endAt: '2026-09-18T10:00:00.000Z',
      endLocal: '2026-09-18T11:00',
      endTimezone: 'Europe/Lisbon',
      ...over,
    });

  it('renders a row at each end, under its own day', () => {
    draw([stay()]);

    expect(screen.getByRole('link', { name: /Check in — Hotel Bairro Alto/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Check out — Hotel Bairro Alto/ })).toBeInTheDocument();

    // Two day headings, eight days apart, from a single booking.
    const days = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatch(/10 September|September 10/);
    expect(days[1]).toMatch(/18 September|September 18/);
  });

  it('shows each row at its own end of the booking, not the whole span', () => {
    draw([stay()]);
    // Check-in at 15:00 Lisbon, check-out at 11:00 — and neither row carries the
    // "→ 11:00" that made an eight-night stay read as a six-hour one.
    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(screen.getByText('11:00')).toBeInTheDocument();
    expect(screen.queryByText(/→/)).toBeNull();
  });

  /** Splitting moves the check-out away, so the length is stated where it went. */
  it('states the length on the check-in row', () => {
    draw([stay()]);
    expect(screen.getByText('8 nights')).toBeInTheDocument();
  });

  it('says "night" rather than "nights" for a single night', () => {
    draw([
      stay({
        endAt: '2026-09-11T10:00:00.000Z',
        endLocal: '2026-09-11T11:00',
      }),
    ]);
    expect(screen.getByText('1 night')).toBeInTheDocument();
  });

  /**
   * A day-use booking is one row. Two rows on a single afternoon is noise — the
   * split exists to put a reminder on a *later* day.
   */
  it('does not split a stay that checks out the day it checked in', () => {
    draw([
      stay({
        endAt: '2026-09-10T20:00:00.000Z',
        endLocal: '2026-09-10T21:00',
      }),
    ]);
    expect(screen.getByRole('link', { name: /^Stay:s*Hotel Bairro Alto$/ })).toBeInTheDocument();
    expect(screen.queryByText(/Check in|Check out/)).toBeNull();
  });

  /**
   * The cache can hold a row written by an older build. A stay with no
   * check-out must render as one row rather than throwing.
   */
  it('does not split a stay with no recorded check-out', () => {
    draw([stay({ endAt: null, endLocal: null, endTimezone: null })]);
    expect(screen.getByRole('link', { name: /^Stay:s*Hotel Bairro Alto$/ })).toBeInTheDocument();
  });

  /**
   * One Directions link per stay, on the row where it is any use. At check-out
   * the traveller is standing in the building, and two identical links days
   * apart is what a screen reader's list of links would have to read out.
   */
  it('offers directions on the check-in row only', () => {
    draw([stay()]);
    const links = screen.getAllByRole('link', { name: /Directions to Hotel Bairro Alto/ });
    expect(links).toHaveLength(1);
  });

  it('badges each row with its own zone', () => {
    // Checked in in Lisbon, checked out after the booking's zone was corrected
    // to Madrid: each row is on its own clock, and home is neither.
    draw(
      [stay({ endTimezone: 'Europe/Madrid', endPlace: null })],
      'America/Toronto',
    );
    expect(screen.getByText('Lisbon')).toBeInTheDocument();
    expect(screen.getByText('Madrid')).toBeInTheDocument();
  });

  it('sorts the check-out row by its own instant, not the booking\'s start', () => {
    // An activity on the 12th falls between the two ends of the stay, so a
    // check-out left sorted beside its check-in would render before it.
    draw([
      stay(),
      item({
        id: 'a9',
        kind: 'activity',
        title: 'Museum',
        startAt: '2026-09-12T09:00:00.000Z',
        startLocal: '2026-09-12T10:00',
      }),
    ]);
    const titles = screen
      .getAllByRole('link', { name: /^(Stay|Activity):/ })
      .map((a) => a.textContent);
    expect(titles).toEqual([
      'Stay: Check in — Hotel Bairro Alto',
      'Activity: Museum',
      'Stay: Check out — Hotel Bairro Alto',
    ]);
  });
});
