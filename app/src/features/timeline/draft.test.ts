import { describe, expect, it } from 'vitest';
import { applyDraft } from './draft';

const form = {
  airline: '',
  flightNumber: '',
  departureAirport: '',
  departureLocal: '',
  arrivalAirport: '',
  arrivalLocal: '',
  passengers: [{ name: '', seat: '' }],
  name: '',
  address: '',
  location: '',
  activityKind: 'other' as const,
  startLocal: '',
  endLocal: '',
  confirmationCode: '',
};

describe('applyDraft', () => {
  it('carries the activity kind the model reported', () => {
    // A forwarded OpenTable booking used to arrive on the form as "Other",
    // because the mapping never read `kind` — on the one screen the import
    // flow exists to save work on.
    const next = applyDraft(form, {
      kind: 'restaurant',
      name: 'Cervejaria Ramiro',
      location: 'Av. Almirante Reis 1',
      startLocal: '2026-09-10T20:30',
      confirmationCode: 'ABC12345',
    });
    expect(next).toMatchObject({
      activityKind: 'restaurant',
      name: 'Cervejaria Ramiro',
      location: 'Av. Almirante Reis 1',
      startLocal: '2026-09-10T20:30',
      confirmationCode: 'ABC12345',
    });
  });

  it('ignores a kind it does not recognise', () => {
    // The value comes from a language model. An unrecognised string would leave
    // the select showing nothing at all.
    expect(applyDraft(form, { kind: 'dinner' }).activityKind).toBe('other');
    expect(applyDraft(form, { kind: 42 }).activityKind).toBe('other');
  });

  it('maps lodging fields onto the shared start and end', () => {
    const next = applyDraft(form, {
      name: 'Hotel Bairro Alto',
      checkInLocal: '2026-09-10T15:00',
      checkOutLocal: '2026-09-18T11:00',
    });
    expect(next.startLocal).toBe('2026-09-10T15:00');
    expect(next.endLocal).toBe('2026-09-18T11:00');
  });

  it('leaves anything the draft does not mention alone', () => {
    const next = applyDraft({ ...form, airline: 'WestJet' }, { name: 'X' });
    expect(next.airline).toBe('WestJet');
  });

  it('carries every passenger, not just a seat', () => {
    /*
     * The case this app exists for is a family travelling together. A single
     * `seat` field could hold their booking only by discarding three of them.
     */
    const next = applyDraft(form, {
      passengers: [
        { name: 'David', seat: '14C' },
        { name: 'Sam', seat: '14D' },
      ],
    });
    expect(next.passengers).toEqual([
      { name: 'David', seat: '14C' },
      { name: 'Sam', seat: '14D' },
    ]);
  });

  it('keeps the form\'s own blank row when the extraction named nobody', () => {
    // Null, not an empty list: "said nothing about people" must leave the row
    // the user types into alone.
    expect(applyDraft(form, {}).passengers).toEqual([{ name: '', seat: '' }]);
    expect(applyDraft(form, { passengers: [] }).passengers).toEqual([{ name: '', seat: '' }]);
    expect(applyDraft(form, { passengers: 'nope' }).passengers).toEqual([{ name: '', seat: '' }]);
  });
});
