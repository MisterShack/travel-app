import type { SegmentMode, TimelineItem } from '@travel/shared';

/** The user's word for each kind — *stay*, never *lodging* (BRAND.md §8). */
export const KIND_LABEL: Record<TimelineItem['kind'], string> = {
  segment: 'Journey',
  lodging: 'Stay',
  activity: 'Activity',
};

/**
 * What each mode is called, and what its operator and service number are called.
 *
 * A train has an operator and a number just as a flight does, but calling them
 * "Airline" and "Flight number" on a Via Rail booking is the flight-first
 * assumption this phase exists to remove (PLAN-V3 §3a).
 */
export const MODE_COPY: Record<
  SegmentMode,
  { label: string; carrier: string; service: string; origin: string; destination: string }
> = {
  air: {
    label: 'Flight',
    carrier: 'Airline',
    service: 'Flight number',
    origin: 'From',
    destination: 'To',
  },
  rail: {
    label: 'Train',
    carrier: 'Operator',
    service: 'Train number',
    origin: 'From station',
    destination: 'To station',
  },
  coach: {
    label: 'Coach',
    carrier: 'Operator',
    service: 'Service number',
    origin: 'From stop',
    destination: 'To stop',
  },
  ferry: {
    label: 'Ferry',
    carrier: 'Operator',
    service: 'Sailing',
    origin: 'From port',
    destination: 'To port',
  },
};
