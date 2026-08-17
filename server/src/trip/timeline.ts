import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  localToInstant,
  type ActivityInput,
  type EventTime,
  type FlightInput,
  type LodgingInput,
  type Passenger,
  type TimelineItem,
} from '@travel/shared';
import { lookupAirport } from '@travel/shared/airports';
import type { Db } from '../db/client';
import { activities, flights, lodging } from '../db/schema';

/**
 * Timeline entities and the merged view (PLAN.md §3, §8).
 *
 * The UTC instant is derived here and never accepted from the client: it is a
 * computed index, and taking it on trust would be exactly the failure §4's
 * "server never trusts the client" rule exists to prevent.
 */

type Derived = { local: string; timezone: string; at: string };

/** Expands a submitted local+zone pair into the stored triple. */
function derive(time: EventTime): Derived {
  return {
    local: time.local,
    timezone: time.timezone,
    at: localToInstant(time.local, time.timezone).instant,
  };
}

/**
 * Anomalies worth telling the user about, rather than silently resolving.
 *
 * A booking at a wall-clock time that does not exist, or one that happens
 * twice, is nearly always a typo — but occasionally it is a real overnight
 * flight on a transition night, so this warns rather than rejects.
 */
export function timeAnomalies(times: Record<string, EventTime | undefined>): string[] {
  const out: string[] = [];
  for (const [field, time] of Object.entries(times)) {
    if (!time) continue;
    const { anomaly } = localToInstant(time.local, time.timezone);
    if (anomaly === 'gap') {
      out.push(`${field}: ${time.local} does not exist in ${time.timezone} — the clocks jump that night.`);
    } else if (anomaly === 'ambiguous') {
      out.push(`${field}: ${time.local} happens twice in ${time.timezone} that night; the earlier one was used.`);
    }
  }
  return out;
}

export async function createFlight(db: Db, tripId: string, input: FlightInput, now: Date) {
  const id = `flt_${randomUUID()}`;
  const dep = derive(input.departure);
  const arr = derive(input.arrival);
  const at = now.toISOString();

  await db.insert(flights).values({
    id,
    tripId,
    airline: input.airline,
    flightNumber: input.flightNumber,
    confirmationCode: input.confirmationCode ?? null,
    departureAirport: input.departureAirport,
    departureLocal: dep.local,
    departureTimezone: dep.timezone,
    departureAt: dep.at,
    arrivalAirport: input.arrivalAirport,
    arrivalLocal: arr.local,
    arrivalTimezone: arr.timezone,
    arrivalAt: arr.at,
    passengers: storedPassengers(input.passengers),
    notes: input.notes ?? null,
    source: 'manual',
    createdAt: at,
    updatedAt: at,
  });

  return id;
}

/**
 * Passengers as stored: JSON, or null when there are none worth keeping.
 *
 * Blank rows are dropped rather than persisted. The form always shows at least
 * one passenger row so there is somewhere to type, and saving an untouched
 * flight should not leave `[{"name":"","seat":""}]` behind for every reader to
 * special-case.
 */
/** "14C, 14D" — the seats on a stored passenger list, or '' when there are none. */
function seatSummary(stored: string | null): string {
  if (stored === null) return '';
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return '';
    return parsed
      .map((p) =>
        p !== null && typeof p === 'object' && typeof (p as Passenger).seat === 'string'
          ? (p as Passenger).seat
          : '',
      )
      .filter((seat) => seat !== '')
      .join(', ');
  } catch {
    return '';
  }
}

function storedPassengers(passengers: Passenger[] | undefined): string | null {
  const kept = (passengers ?? []).filter((p) => p.name !== '' || p.seat !== '');
  return kept.length === 0 ? null : JSON.stringify(kept);
}

export async function createLodging(db: Db, tripId: string, input: LodgingInput, now: Date) {
  const id = `lod_${randomUUID()}`;
  const inn = derive(input.checkIn);
  const out = derive(input.checkOut);
  const at = now.toISOString();

  await db.insert(lodging).values({
    id,
    tripId,
    name: input.name,
    address: input.address ?? null,
    checkInLocal: inn.local,
    checkInTimezone: inn.timezone,
    checkInAt: inn.at,
    checkOutLocal: out.local,
    checkOutTimezone: out.timezone,
    checkOutAt: out.at,
    confirmationCode: input.confirmationCode ?? null,
    notes: input.notes ?? null,
    source: 'manual',
    createdAt: at,
    updatedAt: at,
  });

  return id;
}

export async function createActivity(db: Db, tripId: string, input: ActivityInput, now: Date) {
  const id = `act_${randomUUID()}`;
  const start = derive(input.start);
  const end = input.end ? derive(input.end) : null;
  const at = now.toISOString();

  await db.insert(activities).values({
    id,
    tripId,
    kind: input.kind,
    name: input.name,
    location: input.location ?? null,
    startLocal: start.local,
    startTimezone: start.timezone,
    startAt: start.at,
    endLocal: end?.local ?? null,
    endTimezone: end?.timezone ?? null,
    endAt: end?.at ?? null,
    confirmationCode: input.confirmationCode ?? null,
    notes: input.notes ?? null,
    source: 'manual',
    createdAt: at,
    updatedAt: at,
  });

  return id;
}

/**
 * The merged timeline: a union of the three tables ordered by the UTC instant.
 *
 * Sorting on the instant rather than the local string is the whole point of
 * PLAN.md §4 — a flight that departs London at 10:00 and lands in New York at
 * 13:00 sorts correctly only in UTC; by local string the arrival looks like it
 * happens three hours after departure on the same clock, and an itinerary
 * crossing the date line comes out backwards.
 *
 * Done in application code rather than SQL UNION: three small typed queries are
 * easier to read and to keep in step with the schema than a union that has to
 * pad every table out to a common column list, and a trip has tens of rows, not
 * millions.
 */
export async function getTimeline(db: Db, tripId: string): Promise<TimelineItem[]> {
  const [f, l, a] = await Promise.all([
    db.select().from(flights).where(eq(flights.tripId, tripId)),
    db.select().from(lodging).where(eq(lodging.tripId, tripId)),
    db.select().from(activities).where(eq(activities.tripId, tripId)),
  ]);

  const items: TimelineItem[] = [
    ...f.map((r) => ({
      kind: 'flight' as const,
      id: r.id,
      tripId: r.tripId,
      title: `${r.airline} ${r.flightNumber}`,
      // Seats belong on the row: at the gate, "which seat am I in" is the
      // question, and opening the flight to answer it is a tap too many.
      subtitle: [`${r.departureAirport} → ${r.arrivalAirport}`, seatSummary(r.passengers)]
        .filter((part) => part !== '')
        .join(' · '),
      startAt: r.departureAt,
      startLocal: r.departureLocal,
      startTimezone: r.departureTimezone,
      // The airport's own city. Its zone's namesake is a different place: YOW
      // is Ottawa but sits in America/Toronto, and BOS is Boston in
      // America/New_York.
      startPlace: lookupAirport(r.departureAirport)?.city ?? null,
      endAt: r.arrivalAt,
      endLocal: r.arrivalLocal,
      endTimezone: r.arrivalTimezone,
      endPlace: lookupAirport(r.arrivalAirport)?.city ?? null,
      confirmationCode: r.confirmationCode,
      notes: r.notes,
      source: r.source,
    })),
    ...l.map((r) => ({
      kind: 'lodging' as const,
      id: r.id,
      tripId: r.tripId,
      title: r.name,
      subtitle: r.address,
      startAt: r.checkInAt,
      startLocal: r.checkInLocal,
      startTimezone: r.checkInTimezone,
      // The zone was chosen by hand on the form, so showing it back is
      // faithful — there is no separate place recorded to show instead.
      startPlace: null,
      endAt: r.checkOutAt,
      endLocal: r.checkOutLocal,
      endTimezone: r.checkOutTimezone,
      endPlace: null,
      confirmationCode: r.confirmationCode,
      notes: r.notes,
      source: r.source,
    })),
    ...a.map((r) => ({
      kind: 'activity' as const,
      id: r.id,
      tripId: r.tripId,
      title: r.name,
      subtitle: r.location,
      startAt: r.startAt,
      startLocal: r.startLocal,
      startTimezone: r.startTimezone,
      startPlace: null,
      endAt: r.endAt,
      endLocal: r.endLocal,
      endTimezone: r.endTimezone,
      endPlace: null,
      confirmationCode: r.confirmationCode,
      notes: r.notes,
      source: r.source,
    })),
  ];

  // Ties broken by kind then id so the order is stable across reloads: a
  // timeline that reshuffles two same-minute items on every fetch looks broken.
  return items.sort(
    (x, y) => x.startAt.localeCompare(y.startAt) || x.kind.localeCompare(y.kind) || x.id.localeCompare(y.id),
  );
}

/**
 * What a reminder for this entity should say and when it should fire.
 *
 * Built from the **stored** row rather than the submitted input, so it always
 * reflects what was actually saved — including the derived instant.
 */
export function reminderSubjectFor(kind: EntityKind, row: Record<string, unknown>) {
  if (kind === 'flight') {
    return {
      tripId: String(row['tripId']),
      relatedType: 'flight' as const,
      relatedId: String(row['id']),
      startAt: String(row['departureAt']),
      timezone: String(row['departureTimezone']),
      title: `${String(row['airline'])} ${String(row['flightNumber'])}`,
      detail: `${String(row['departureAirport'])} → ${String(row['arrivalAirport'])}`,
      place: lookupAirport(String(row['departureAirport']))?.city ?? null,
    };
  }
  if (kind === 'lodging') {
    return {
      tripId: String(row['tripId']),
      relatedType: 'lodging' as const,
      relatedId: String(row['id']),
      startAt: String(row['checkInAt']),
      timezone: String(row['checkInTimezone']),
      title: String(row['name']),
      detail: row['address'] ? String(row['address']) : '',
      place: null,
    };
  }
  return {
    tripId: String(row['tripId']),
    relatedType: 'activity' as const,
    relatedId: String(row['id']),
    startAt: String(row['startAt']),
    timezone: String(row['startTimezone']),
    title: String(row['name']),
    detail: row['location'] ? String(row['location']) : '',
    place: null,
  };
}

const TABLES = { flight: flights, lodging, activity: activities } as const;
export type EntityKind = keyof typeof TABLES;

/** Resolves an entity to its trip, so authorisation can be checked (PLAN.md §10). */
export async function tripIdOf(db: Db, kind: EntityKind, id: string): Promise<string | null> {
  const table = TABLES[kind];
  const rows = await db.select({ tripId: table.tripId }).from(table).where(eq(table.id, id)).limit(1);
  return rows[0]?.tripId ?? null;
}

/** One entity, for the edit form to populate itself from. */
export async function getEntity(db: Db, kind: EntityKind, id: string) {
  const table = TABLES[kind];
  const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteEntity(db: Db, kind: EntityKind, id: string, tripId: string) {
  const table = TABLES[kind];
  await db.delete(table).where(and(eq(table.id, id), eq(table.tripId, tripId)));
}

/**
 * Updates are a **full replace** of the editable fields, not a sparse merge.
 *
 * The client's edit form always holds the whole entity, and a sparse patch on
 * an event time is a trap: changing only `local` without `timezone` would leave
 * the stored instant derived from a zone the caller never saw. Replacing the
 * whole triple at once makes that impossible. Kept on the PATCH verb because
 * that is what PLAN.md §10 sketched; the semantics are stated here rather than
 * inferred from the method.
 */
export async function updateFlight(db: Db, id: string, input: FlightInput, now: Date) {
  const dep = derive(input.departure);
  const arr = derive(input.arrival);
  await db
    .update(flights)
    .set({
      airline: input.airline,
      flightNumber: input.flightNumber,
      confirmationCode: input.confirmationCode ?? null,
      departureAirport: input.departureAirport,
      departureLocal: dep.local,
      departureTimezone: dep.timezone,
      departureAt: dep.at,
      arrivalAirport: input.arrivalAirport,
      arrivalLocal: arr.local,
      arrivalTimezone: arr.timezone,
      arrivalAt: arr.at,
      passengers: storedPassengers(input.passengers),
      notes: input.notes ?? null,
      updatedAt: now.toISOString(),
    })
    .where(eq(flights.id, id));
}

export async function updateLodging(db: Db, id: string, input: LodgingInput, now: Date) {
  const inn = derive(input.checkIn);
  const out = derive(input.checkOut);
  await db
    .update(lodging)
    .set({
      name: input.name,
      address: input.address ?? null,
      checkInLocal: inn.local,
      checkInTimezone: inn.timezone,
      checkInAt: inn.at,
      checkOutLocal: out.local,
      checkOutTimezone: out.timezone,
      checkOutAt: out.at,
      confirmationCode: input.confirmationCode ?? null,
      notes: input.notes ?? null,
      updatedAt: now.toISOString(),
    })
    .where(eq(lodging.id, id));
}

export async function updateActivity(db: Db, id: string, input: ActivityInput, now: Date) {
  const start = derive(input.start);
  const end = input.end ? derive(input.end) : null;
  await db
    .update(activities)
    .set({
      kind: input.kind,
      name: input.name,
      location: input.location ?? null,
      startLocal: start.local,
      startTimezone: start.timezone,
      startAt: start.at,
      endLocal: end?.local ?? null,
      endTimezone: end?.timezone ?? null,
      endAt: end?.at ?? null,
      confirmationCode: input.confirmationCode ?? null,
      notes: input.notes ?? null,
      updatedAt: now.toISOString(),
    })
    .where(eq(activities.id, id));
}
