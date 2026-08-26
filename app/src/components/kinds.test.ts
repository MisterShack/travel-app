import { describe, expect, it } from 'vitest';
import { countedKindLabel, KIND_LABEL, KIND_LABEL_PLURAL } from './kinds';

describe('countedKindLabel', () => {
  /**
   * The bug this replaced: the tally row appended \`s\` to the singular, so the
   * trips list read **"3 activitys"**. Activity is the one of the three that
   * does not take a bare \`s\`, which is exactly why a table beats a rule.
   */
  it('pluralises activity correctly', () => {
    expect(countedKindLabel('activity', 1)).toBe('activity');
    expect(countedKindLabel('activity', 3)).toBe('activities');
    expect(countedKindLabel('activity', 3)).not.toBe('activitys');
  });

  it('pluralises the two regular kinds', () => {
    expect(countedKindLabel('segment', 1)).toBe('journey');
    expect(countedKindLabel('segment', 2)).toBe('journeys');
    expect(countedKindLabel('lodging', 1)).toBe('stay');
    expect(countedKindLabel('lodging', 2)).toBe('stays');
  });

  /** A count of none is not one of anything. */
  it('uses the plural for zero', () => {
    expect(countedKindLabel('activity', 0)).toBe('activities');
    expect(countedKindLabel('lodging', 0)).toBe('stays');
  });

  it('covers every kind in both forms, so a new kind cannot ship unpluralised', () => {
    for (const kind of Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]) {
      expect(KIND_LABEL_PLURAL[kind]).toBeTruthy();
      expect(KIND_LABEL_PLURAL[kind]).not.toBe(KIND_LABEL[kind]);
    }
  });
});
