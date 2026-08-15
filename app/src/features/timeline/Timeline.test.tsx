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
    startAt: '2026-09-10T12:00:00.000Z',
    startLocal: '2026-09-10T13:00',
    startTimezone: 'Europe/Lisbon',
    endAt: null,
    endLocal: null,
    endTimezone: null,
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
        kind: 'flight',
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

  it('labels the badge with the city, not a UTC offset', () => {
    // In September both Europe/London and Europe/Lisbon render as "GMT+1"
    // through Intl's short name, so an offset badge gave two different zones an
    // identical label and stopped carrying any information.
    draw(
      [
        item({
          id: 'f1',
          kind: 'flight',
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
    // "15:00 -> 11:00" reads as a six-hour hotel stay when it is eight nights.
    draw([
      item({
        kind: 'lodging',
        title: 'Hotel Bairro Alto',
        startAt: '2026-09-10T14:00:00.000Z',
        endAt: '2026-09-18T10:00:00.000Z',
        endTimezone: 'Europe/Lisbon',
      }),
    ]);
    expect(screen.getByText(/18 Sep|Sep 18/)).toBeInTheDocument();
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
