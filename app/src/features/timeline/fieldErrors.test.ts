import { describe, expect, it } from 'vitest';
import { describeRejection, invalidFieldLabels, listPhrase } from './fieldErrors';

/**
 * A rejected save used to say "Check the journey details." and mark nothing —
 * twelve controls and a passenger list, with no indication which one was wrong.
 * The server was already sending the Zod issues; only the translation from
 * schema path to the label on screen was missing (WCAG 3.3.1).
 */

const SEGMENT = {
  carrier: 'Airline',
  service: 'Flight number',
  origin: 'From',
  departure: 'Departs',
  destination: 'To',
  arrival: 'Arrives',
};

describe('invalidFieldLabels', () => {
  it('names the fields the issues point at', () => {
    const issues = [
      { path: ['origin'], message: 'Required' },
      { path: ['arrival', 'local'], message: 'Invalid' },
    ];
    expect(invalidFieldLabels(issues, SEGMENT)).toEqual(['From', 'Arrives']);
  });

  it('collapses a nested path to the control the user sees', () => {
    // `departure.local` and `departure.timezone` are one field on the form, and
    // naming it twice would be noise rather than detail.
    const issues = [{ path: ['departure', 'local'] }, { path: ['departure', 'timezone'] }];
    expect(invalidFieldLabels(issues, SEGMENT)).toEqual(['Departs']);
  });

  it('uses the label for the current mode, not the field name', () => {
    // A Via Rail booking must be told to look at "Operator". Telling someone
    // staring at a field called Operator that `carrier` failed is its own kind
    // of unhelpful.
    const rail = { ...SEGMENT, carrier: 'Operator', service: 'Train number' };
    expect(invalidFieldLabels([{ path: ['carrier'] }], rail)).toEqual(['Operator']);
  });

  it('ignores paths it cannot map rather than inventing a name', () => {
    expect(invalidFieldLabels([{ path: ['somethingNew'] }], SEGMENT)).toEqual([]);
  });

  it('survives anything that is not a list of issues', () => {
    // `issues` is typed `unknown` because it crosses the wire. A malformed
    // payload must not take the error message down with it.
    for (const junk of [undefined, null, 'nope', {}, [null], [{}], [{ path: [] }]]) {
      expect(invalidFieldLabels(junk, SEGMENT)).toEqual([]);
    }
  });
});

describe('listPhrase', () => {
  it('reads as a sentence rather than a list', () => {
    expect(listPhrase(['From'])).toBe('From');
    expect(listPhrase(['From', 'Arrives'])).toBe('From and Arrives');
    expect(listPhrase(['From', 'To', 'Arrives'])).toBe('From, To and Arrives');
    expect(listPhrase([])).toBe('');
  });
});

describe('describeRejection', () => {
  it('adds the fields to the server’s own sentence', () => {
    const message = describeRejection(
      'Check the journey details.',
      [{ path: ['origin'] }, { path: ['arrival', 'local'] }],
      SEGMENT,
    );
    expect(message).toBe('Check the journey details. Look at From and Arrives.');
  });

  it('falls back to the server message when nothing maps', () => {
    // The server knows why it refused; this only knows where. With no "where"
    // it must not dress the message up with detail it does not have.
    expect(describeRejection('Check the journey details.', undefined, SEGMENT)).toBe(
      'Check the journey details.',
    );
  });
});
