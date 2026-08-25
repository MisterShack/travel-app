import {
  NEARBY_QUESTIONS,
  nearbyAnswerSchema,
  type NearbyAnswer,
  type NearbyIntent,
  type NearbyPlace,
} from '@travel/shared';

/**
 * Grounding with Google Maps, over the same `generateContent` endpoint and the
 * same key the booking import already uses (PLAN-V3 §3).
 *
 * No new vendor and no new credential: `GEMINI_API_KEY` exists and is on the
 * paid tier, which was chosen for the import's privacy reasons and applies here
 * for the same one — the prompt carries where a family is staying.
 */

export type NearbyResult = { ok: true; answer: NearbyAnswer } | { ok: false; reason: string };

/**
 * The response shape, as the `v1beta` REST API returns it.
 *
 * Typed here rather than inferred so a field rename shows up as a compile error
 * at the one place that reads it. `maps.placeId` is deliberately unread: it is
 * a Places identifier, and holding one is exactly what the retention question
 * in ROADMAP §4 is still open about.
 */
type GroundedResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: {
      groundingChunks?: { maps?: { uri?: string; title?: string } }[];
    };
  }[];
};

/**
 * Ask one fixed question about one place.
 *
 * **Not JSON mode.** The import sets `responseMimeType: 'application/json'` and
 * parses a structured booking out of the reply; this one must not. A grounded
 * answer is prose plus a `groundingMetadata` block, and the citations live in
 * the metadata rather than in anything the model writes — so asking for JSON
 * fights the tool and throws away the half that is contractually required.
 */
export async function askNearby(opts: {
  intent: NearbyIntent;
  /** The place as the user entered it — a lodging address or an activity's location. */
  place: string;
  apiKey: string;
  model: string;
}): Promise<NearbyResult> {
  const { intent, place, apiKey, model } = opts;
  const { question } = NEARBY_QUESTIONS[intent];

  /**
   * The address goes in the prompt rather than in
   * `toolConfig.retrievalConfig.latLng`, which is the other way to give the
   * tool a location. We do not have coordinates — geocoding on import is
   * Phase 9 and is blocked on choosing a provider (ROADMAP §2). An address is
   * what this app actually holds, and it is what the user typed.
   */
  const prompt =
    `I am at ${place}. ${question}\n\n` +
    'Answer in two or three short sentences. Name specific places and say roughly how far ' +
    'each one is on foot. If you are not confident about this location, say so plainly ' +
    'rather than guessing.';

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleMaps: {} }],
        }),
      },
    );
  } catch (error) {
    // A question asked abroad on a bad connection is the case this feature
    // exists for, so a dead network is an expected outcome, not an exception.
    return { ok: false, reason: `Could not reach the model: ${(error as Error).message}` };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const message = (() => {
      try {
        return (JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? detail;
      } catch {
        return detail;
      }
    })();
    return {
      ok: false,
      reason:
        `Gemini returned ${response.status} for model "${model}"` +
        (message ? `: ${message.slice(0, 300)}` : ''),
    };
  }

  const body = (await response.json().catch(() => null)) as GroundedResponse | null;
  const candidate = body?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) return { ok: false, reason: 'The model returned no answer' };

  /**
   * Citations, deduplicated by URI.
   *
   * The model routinely cites the same place in support of two different
   * sentences, and the same Maps link twice under one answer reads as a bug.
   * Order is the API's, which is the order the supports refer to.
   */
  const seen = new Set<string>();
  const places: NearbyPlace[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.maps?.uri;
    const title = chunk.maps?.title;
    if (!uri || !title || seen.has(uri)) continue;
    seen.add(uri);
    places.push({ title, uri });
  }

  /**
   * **An answer with no citations is not shippable, so it is not returned.**
   *
   * Grounding with Google Maps requires that the sources are shown, that they
   * immediately follow the content they support, and that they are reachable
   * within one interaction (PLAN-V3 §3). If the metadata carries none, there is
   * nothing to satisfy that with — and prose about restaurants that came back
   * ungrounded is also the case most likely to be invented. Refusing is both
   * the compliant answer and the honest one.
   */
  if (places.length === 0) {
    return { ok: false, reason: 'The model answered without citing any places' };
  }

  const parsed = nearbyAnswerSchema.safeParse({ intent, text, places, generated: true });
  if (!parsed.success) return { ok: false, reason: 'The model returned an unusable answer' };
  return { ok: true, answer: parsed.data };
}
