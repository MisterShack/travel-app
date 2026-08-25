import { describe, expect, it } from 'vitest';
import {
  NEARBY_QUESTIONS,
  nearbyAnswerSchema,
  nearbyIntents,
  nearbyRequestSchema,
} from './nearby';

describe('nearby intents', () => {
  it('has a label and a question for every intent', () => {
    // The chips are rendered from this table, so an intent missing an entry is
    // a blank chip rather than a type error.
    for (const intent of nearbyIntents) {
      expect(NEARBY_QUESTIONS[intent].label.length).toBeGreaterThan(0);
      expect(NEARBY_QUESTIONS[intent].question.length).toBeGreaterThan(0);
    }
    expect(Object.keys(NEARBY_QUESTIONS)).toHaveLength(nearbyIntents.length);
  });

  it('rejects an intent it does not know', () => {
    // The request body is the one thing here a client controls, and an
    // unbounded intent is an unbounded prompt — the free-form question that was
    // deliberately deferred, arriving by the back door.
    expect(nearbyRequestSchema.safeParse({ intent: 'anything you like' }).success).toBe(false);
    expect(nearbyRequestSchema.safeParse({ intent: 'eat' }).success).toBe(true);
  });
});

describe('nearby answers', () => {
  const answer = {
    intent: 'eat' as const,
    text: 'There are a few good options within a five minute walk.',
    places: [{ title: 'Chez Julien', uri: 'https://maps.google.com/?cid=1' }],
    generated: true as const,
  };

  it('accepts an answer that carries its citations', () => {
    expect(nearbyAnswerSchema.safeParse(answer).success).toBe(true);
  });

  it('will not validate an answer whose citations are missing', () => {
    // Attribution is contractual, not decoration: Grounding with Google Maps
    // requires the sources be shown with the content they support (PLAN-V3 §3).
    // `places` is required so a caller cannot construct an answer without it.
    const { places: _places, ...withoutPlaces } = answer;
    expect(nearbyAnswerSchema.safeParse(withoutPlaces).success).toBe(false);
  });

  it('will not validate an answer that does not admit it was generated', () => {
    // The import queue set the precedent: if a model produced it, the screen
    // says so, and the flag is a literal so it cannot be quietly set false.
    expect(nearbyAnswerSchema.safeParse({ ...answer, generated: false }).success).toBe(false);
  });
});
