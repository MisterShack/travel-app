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

export const timelineKinds = ['segment', 'lodging', 'activity'] as const;
export const timelineKindSchema = z.enum(timelineKinds);
export type TimelineKind = z.infer<typeof timelineKindSchema>;

/**
 * How a segment carries you (PLAN-V3 §3a).
 *
 * A train has everything a flight has — origin, destination, departure,
 * arrival — and only `flights` modelled that shape, so a rail journey landed as
 * a generic activity and its destination was thrown away. Most travel apps are
 * US-built and flight-first; in Canada and Europe that is simply wrong.
 */
export const segmentModes = ['air', 'rail', 'coach', 'ferry'] as const;
export const segmentModeSchema = z.enum(segmentModes);
export type SegmentMode = z.infer<typeof segmentModeSchema>;

/**
 * An endpoint is an IATA code for air and a place name for everything else.
 *
 * There is no IATA for railway stations, and inventing one would be worse than
 * a name: "Ottawa" is what the ticket says. The zone is asked for rather than
 * derived, exactly as lodging already does — the airport table can answer it
 * for air, and nothing can answer it for rail.
 */
const endpointSchema = z.string().trim().min(1).max(80);

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

export const segmentInputSchema = z
  .object({
    mode: segmentModeSchema,
    /** The airline, the railway, the operator. */
    carrier: z.string().trim().min(1).max(80),
    /** The flight number, the train number, the sailing. */
    service: z.string().trim().min(1).max(20),
    confirmationCode: z.string().trim().max(40).optional(),
    origin: endpointSchema,
    departure: eventTimeSchema,
    destination: endpointSchema,
    arrival: eventTimeSchema,
    passengers: z.array(passengerSchema).max(20).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  // Air endpoints are still held to IATA: the code is what derives the zone,
  // and a free-text airport would quietly lose that.
  .superRefine((seg, ctx) => {
    if (seg.mode !== 'air') return;
    for (const field of ['origin', 'destination'] as const) {
      if (!/^[A-Z]{3}$/.test(seg[field].toUpperCase())) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'Airport codes are three letters, e.g. LHR',
        });
      }
    }
  })
  .transform((seg) =>
    seg.mode === 'air'
      ? { ...seg, origin: seg.origin.toUpperCase(), destination: seg.destination.toUpperCase() }
      : seg,
  )
  // Checked on the instants server-side too; this catches the obvious case
  // early and gives the form a field to point at.
  .refine((f) => f.departure.local <= f.arrival.local || f.departure.timezone !== f.arrival.timezone, {
    message: 'Arrival is before departure',
    path: ['arrival'],
  });
export type SegmentInput = z.infer<typeof segmentInputSchema>;

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
  /**
   * Somewhere you could actually go: a lodging's address, or an activity's
   * location. Null for segments, and null whenever the field was left blank.
   *
   * It duplicates what `subtitle` displays for those two kinds, and that is the
   * point. The conflict rule once read its endpoints by splitting the subtitle,
   * which held only until seats were appended to it; a display string is not an
   * interface, and handing one to a maps app would fail the same way the first
   * time anything else is appended.
   */
  address: z.string().nullable(),
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
  /** Present on segments only: how this one carries you. */
  mode: segmentModeSchema.nullable(),
  /**
   * The endpoints as the booking states them — an IATA code for air, a station
   * name for rail. Null for anything that is not a segment.
   *
   * Separate from `startPlace`/`endPlace`, which name the *place* for the zone
   * badge. The two differ on purpose: LHR and LGW are both "London" and must
   * still compare as a change of airport, while an Ottawa arrival must read as
   * Ottawa and not as its zone's namesake.
   */
  origin: z.string().nullable(),
  destination: z.string().nullable(),
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
