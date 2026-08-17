import { z } from 'zod';
import { localDateTimeSchema, timeZoneSchema } from './common';

/**
 * Timeline entities (PLAN.md §3).
 *
 * Every event time is submitted as a **local wall-clock time plus an IANA
 * zone**. The UTC instant is derived server-side and never accepted from the
 * client — it is a computed index, and letting a client supply it would be
 * exactly the "server trusts the client" failure §4 forbids.
 */

export const eventTimeSchema = z.object({
  local: localDateTimeSchema,
  timezone: timeZoneSchema,
});
export type EventTime = z.infer<typeof eventTimeSchema>;

export const timelineKinds = ['flight', 'lodging', 'activity'] as const;
export const timelineKindSchema = z.enum(timelineKinds);
export type TimelineKind = z.infer<typeof timelineKindSchema>;

const iataSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Airport codes are three letters, e.g. LHR');

/**
 * One traveller on a booking.
 *
 * Seats belong to people, not to flights. A single `seat` column could hold a
 * family's booking only by throwing three of them away, which is what it did.
 * The name may be empty — an airline confirmation often states a seat and no
 * name, and refusing the seat over the missing name would be the wrong trade.
 */
export const passengerSchema = z.object({
  name: z.string().trim().max(80),
  seat: z.string().trim().max(10),
});
export type Passenger = z.infer<typeof passengerSchema>;

export const flightInputSchema = z
  .object({
    airline: z.string().trim().min(1).max(80),
    flightNumber: z.string().trim().min(1).max(10),
    confirmationCode: z.string().trim().max(40).optional(),
    departureAirport: iataSchema,
    departure: eventTimeSchema,
    arrivalAirport: iataSchema,
    arrival: eventTimeSchema,
    passengers: z.array(passengerSchema).max(20).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  // Checked on the instants server-side too; this catches the obvious case
  // early and gives the form a field to point at.
  .refine((f) => f.departure.local <= f.arrival.local || f.departure.timezone !== f.arrival.timezone, {
    message: 'Arrival is before departure',
    path: ['arrival'],
  });
export type FlightInput = z.infer<typeof flightInputSchema>;

export const lodgingInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(300).optional(),
  checkIn: eventTimeSchema,
  checkOut: eventTimeSchema,
  confirmationCode: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type LodgingInput = z.infer<typeof lodgingInputSchema>;

export const activityKinds = ['restaurant', 'attraction', 'transport', 'other'] as const;
export const activityKindSchema = z.enum(activityKinds);

export const activityInputSchema = z.object({
  kind: activityKindSchema,
  name: z.string().trim().min(1).max(160),
  location: z.string().trim().max(300).optional(),
  start: eventTimeSchema,
  end: eventTimeSchema.optional(),
  confirmationCode: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ActivityInput = z.infer<typeof activityInputSchema>;

/**
 * One row of the merged timeline. The three entity types have meaningfully
 * different fields, so they are separate tables (PLAN.md §3) — this is the
 * shape they are flattened into for display, ordered by `startAt`.
 */
export const timelineItemSchema = z.object({
  kind: timelineKindSchema,
  id: z.string(),
  tripId: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  /** UTC instant — what the timeline sorts on. */
  startAt: z.string(),
  startLocal: localDateTimeSchema,
  startTimezone: timeZoneSchema,
  /**
   * Where the event actually happens, when the app knows it independently of
   * the zone — the airport's city, for a flight.
   *
   * A zone is not a place. `America/Toronto` is the zone for Ottawa, Montreal,
   * Detroit and Iqaluit, so labelling an Ottawa arrival with its zone's
   * namesake reads as a wrong city rather than as a timezone. It is null for
   * lodging and activities, whose zone the user chose by hand: showing them
   * back the zone they picked is faithful, and there is no separate place to
   * show instead.
   */
  startPlace: z.string().nullable(),
  /** Present for flights (arrival), lodging (check-out) and timed activities. */
  endAt: z.string().nullable(),
  endLocal: localDateTimeSchema.nullable(),
  endTimezone: timeZoneSchema.nullable(),
  endPlace: z.string().nullable(),
  confirmationCode: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.enum(['manual', 'import']),
});
export type TimelineItem = z.infer<typeof timelineItemSchema>;
