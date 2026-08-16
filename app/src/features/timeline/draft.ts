/**
 * Applying an imported draft to the event form.
 *
 * A draft only ever *prefills*: the user still submits through the same
 * validated route, which is what stops an import writing a row a human could
 * not have typed (PLAN.md §4).
 *
 * Kept out of the component so the mapping can be tested directly. It is the
 * seam where model output meets the form, and a field silently missing from it
 * is invisible until someone forwards the right email.
 */

export const ACTIVITY_KINDS = ['restaurant', 'attraction', 'transport', 'other'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type DraftFields = Record<string, unknown>;

type Prefillable = {
  airline: string;
  flightNumber: string;
  departureAirport: string;
  departureLocal: string;
  arrivalAirport: string;
  arrivalLocal: string;
  seat: string;
  name: string;
  address: string;
  location: string;
  activityKind: ActivityKind;
  startLocal: string;
  endLocal: string;
  confirmationCode: string;
};

const isActivityKind = (v: unknown): v is ActivityKind =>
  typeof v === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(v);

export function applyDraft<T extends Prefillable>(prev: T, draft: DraftFields): T {
  const str = (k: string) => (typeof draft[k] === 'string' ? (draft[k] as string) : '');

  return {
    ...prev,
    airline: str('airline') || prev.airline,
    flightNumber: str('flightNumber') || prev.flightNumber,
    departureAirport: str('departureAirport') || prev.departureAirport,
    departureLocal: str('departureLocal') || prev.departureLocal,
    arrivalAirport: str('arrivalAirport') || prev.arrivalAirport,
    arrivalLocal: str('arrivalLocal') || prev.arrivalLocal,
    seat: str('seat') || prev.seat,
    name: str('name') || prev.name,
    address: str('address') || prev.address,
    location: str('location') || prev.location,
    /**
     * The model reports what sort of activity it is, and until now nothing read
     * it — a forwarded OpenTable booking arrived on the form as "Other" and had
     * to be re-classified by hand, on the one screen the whole import flow
     * exists to save work on.
     *
     * Checked against the allowed set rather than cast: the value comes from a
     * language model, and an unrecognised string would leave the select showing
     * nothing at all.
     */
    activityKind: isActivityKind(draft['kind']) ? draft['kind'] : prev.activityKind,
    startLocal: str('startLocal') || str('checkInLocal') || prev.startLocal,
    endLocal: str('endLocal') || str('checkOutLocal') || prev.endLocal,
    confirmationCode: str('confirmationCode') || prev.confirmationCode,
  };
}
