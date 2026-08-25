import { describe, expect, it } from 'vitest';
import { cityFromAddress, lookupAirport, lookupCity } from './airports';

/**
 * The city lookup exists so a lodging or activity can be labelled with the
 * place it is in rather than its timezone's namesake — `America/Toronto` is the
 * correct zone for Montreal, and a Montreal dinner read as "Toronto"
 * (reported 2026-08-25).
 *
 * **It resolves a name, never a zone.** That is the whole safety argument:
 * three Portlands sit in three timezones, so deriving a zone from this text
 * would be a guess, while echoing the spelling back is not.
 */

describe('lookupCity', () => {
  it('finds a city the airport table knows', () => {
    expect(lookupCity('Montreal')).toBe('Montreal');
    expect(lookupCity('ottawa')).toBe('Ottawa');
  });

  it('folds diacritics, because that is how people actually write it', () => {
    // Not cosmetic. The table is anglicised and the people who live there are
    // not, so an address typed in Quebec would otherwise never match.
    expect(lookupCity('Montréal')).toBe('Montreal');
    expect(lookupCity('Zürich')).toBe('Zurich');
    expect(lookupCity('São Paulo')).toBe('Sao Paulo');
  });

  it('ignores postal codes sitting next to the city', () => {
    expect(lookupCity('75006 Paris')).toBe('Paris');
  });

  it('refuses anything too short to be a city name', () => {
    // A province code or a house number that survived normalisation is far
    // likelier than a real two-letter city.
    expect(lookupCity('QC')).toBeUndefined();
    expect(lookupCity('7')).toBeUndefined();
  });

  it('returns undefined for something that is not a city', () => {
    expect(lookupCity('Café Olimpico')).toBeUndefined();
  });
});

describe('cityFromAddress', () => {
  it('reads the city out of a street address', () => {
    expect(cityFromAddress('80 Rue de Charonne, Paris')).toBe('Paris');
    expect(cityFromAddress('45 Boulevard Raspail, 75006 Paris, France')).toBe('Paris');
  });

  it('handles a bare city, which is what most people type', () => {
    expect(cityFromAddress('Montreal')).toBe('Montreal');
  });

  it('finds the city behind a venue name', () => {
    expect(cityFromAddress('Café Olimpico, Montréal')).toBe('Montreal');
  });

  it('prefers the later component, because addresses run narrow to broad', () => {
    // A street named after a city must not beat the city the address is in.
    expect(cityFromAddress('Lisbon Street, Montreal')).toBe('Montreal');
  });

  it('gives up rather than guessing, so the caller can fall back to the zone', () => {
    expect(cityFromAddress('Café Olimpico')).toBeUndefined();
    expect(cityFromAddress('')).toBeUndefined();
    expect(cityFromAddress(null)).toBeUndefined();
  });

  it('resolves a name and never a zone', () => {
    // The safety property, stated as a test. All three Portlands are spelled
    // the same and sit in different zones, so the name is safe to echo and the
    // zone would not have been safe to derive.
    expect(cityFromAddress('Portland')).toBe('Portland');
    expect(lookupAirport('PDX')?.timeZone).toBe('America/Los_Angeles');
    expect(lookupAirport('PWM')?.timeZone).toBe('America/New_York');
  });
});
