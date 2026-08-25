import { z } from 'zod';

/**
 * "What's nearby" — Phase 10 (PLAN-V3 §3).
 *
 * **Pulled, never pushed.** Nothing here runs on its own: every answer is the
 * result of someone tapping a question about a place they already put on their
 * trip. That is the whole reason this phase was buildable without spending the
 * app's character — a suggestion you asked for is not a suggestion.
 *
 * The questions are a fixed set rather than free text. It bounds the cost, it
 * keeps the answers predictable enough to lay out, and it covers what was
 * actually asked for. A free-form question is deliberately held back for a paid
 * tier if one ever exists: it is at once the more useful version and the
 * unbounded one, which makes it the natural thing to put behind a subscription
 * rather than in front of a free allowance.
 */

export const nearbyIntents = ['eat', 'transit', 'coffee', 'essentials'] as const;
export const nearbyIntentSchema = z.enum(nearbyIntents);
export type NearbyIntent = z.infer<typeof nearbyIntentSchema>;

/** The words on the chip, and the question actually put to the model. */
export const NEARBY_QUESTIONS: Record<NearbyIntent, { label: string; question: string }> = {
  eat: {
    label: 'Eat nearby',
    question: 'What are a few good places to eat within walking distance?',
  },
  transit: {
    label: 'Getting around',
    question:
      'What is the nearest metro, subway or train station, and roughly how far is it on foot?',
  },
  coffee: { label: 'Coffee', question: 'Where can I get good coffee within walking distance?' },
  essentials: {
    label: 'Essentials',
    question: 'Where is the nearest pharmacy, and the nearest grocery shop?',
  },
};

export const nearbyRequestSchema = z.object({ intent: nearbyIntentSchema });

/**
 * A place the model cited, and the Maps link for it.
 *
 * **Not optional decoration.** Grounding with Google Maps requires that sources
 * are shown, that they immediately follow the content they support, and that
 * they are reachable within one interaction. A rendering that drops these is
 * not a tidier design, it is a term of use unmet — which is why the citation is
 * part of the response type rather than something the UI may choose to use.
 */
export const nearbyPlaceSchema = z.object({
  title: z.string(),
  uri: z.string(),
});

export const nearbyAnswerSchema = z.object({
  intent: nearbyIntentSchema,
  /** Prose, as the model wrote it. Rendered as text — never as HTML. */
  text: z.string(),
  places: z.array(nearbyPlaceSchema),
  /**
   * Always true today, and present so the UI never has to assume. The import
   * queue set the precedent: if a model produced it, the screen says so.
   */
  generated: z.literal(true),
});

export type NearbyAnswer = z.infer<typeof nearbyAnswerSchema>;
export type NearbyPlace = z.infer<typeof nearbyPlaceSchema>;
