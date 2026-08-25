import { useId, useRef, useState } from 'react';
import {
  NEARBY_QUESTIONS,
  nearbyIntents,
  type NearbyAnswer,
  type NearbyIntent,
} from '@travel/shared';
import { api, ApiError, OfflineError } from '@/api/client';
import { useAuth } from '@/auth/useAuth';

/**
 * "What's nearby" — Phase 10 (PLAN-V3 §3).
 *
 * **Pulled, never pushed.** Nothing here runs on mount. Every request is a chip
 * someone tapped, which is what lets this exist without spending the app's
 * character: a suggestion you asked for is not a suggestion.
 *
 * It lives on the event's own page rather than on the timeline row. The row was
 * cut back to two links on 2026-08-25 and the accessibility audit had already
 * flagged the one action on it as under the touch target; an answer needs room
 * to render anyway, and tapping a card already opens this screen.
 */

type Props = {
  kind: 'lodging' | 'activity';
  id: string;
  /** The address **as stored**, which is what the server will ask about. */
  stored: string;
  /** True when the form's address field has been edited and not yet saved. */
  edited: boolean;
};

const PATH: Record<Props['kind'], string> = { lodging: 'lodging', activity: 'activities' };

export function Nearby({ kind, id, stored, edited }: Props) {
  const { offline } = useAuth();
  const headingId = useId();
  /** Names the sentence explaining why the chips are refusing, for `aria-describedby`. */
  const reasonId = useId();
  const [asked, setAsked] = useState<NearbyIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<NearbyAnswer | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState('');

  /**
   * Offline is a refusal, not a silent failure — and for now it is a real one.
   * PLAN-V3 §3 wants these answers cached and readable offline, and that half
   * is deliberately not built: how long a grounded Maps result may be kept is
   * undocumented and is the open gate in ROADMAP §4. Saying so is better than a
   * chip that spins and fails.
   */
  const blocked = offline
    ? 'Offline — asking needs a connection.'
    : edited
      ? 'Save the address first, or the answer will be about the old one.'
      : '';

  /**
   * Which request is the current one.
   *
   * A chip stays live while another question is in flight (see below), so two
   * can overlap. Without this, a slow first answer lands after a fast second
   * one and replaces it — the screen would then show the wrong answer under a
   * chip that correctly says which question was asked.
   */
  const latest = useRef(0);

  const ask = (intent: NearbyIntent) => {
    const mine = ++latest.current;
    setAsked(intent);
    setBusy(true);
    setError('');
    setAnswer(null);

    void (async () => {
      try {
        const res = await api.post<{ answer: NearbyAnswer; remaining: number }>(
          `/${PATH[kind]}/${id}/nearby`,
          { intent },
        );
        if (latest.current !== mine) return;
        setAnswer(res.answer);
        setRemaining(res.remaining);
      } catch (err) {
        if (latest.current !== mine) return;
        // The server's own messages are already written for a person — the
        // daily cap and the missing key both say what happened and what to do.
        setError(
          err instanceof OfflineError
            ? 'No connection, so there is nothing to ask.'
            : err instanceof ApiError
              ? err.message
              : 'Could not look that up just now.',
        );
      } finally {
        if (latest.current === mine) setBusy(false);
      }
    })();
  };

  return (
    <section className="nearby" aria-labelledby={headingId}>
      <h3 id={headingId}>What&rsquo;s nearby</h3>
      <p className="muted tiny">Around {stored}.</p>

      <div className="nearby-chips">
        {nearbyIntents.map((intent) => (
          <button
            key={intent}
            type="button"
            className={`nearby-chip${asked === intent ? ' is-current' : ''}`}
            /*
             * **No `aria-pressed`.** It promises a toggle these are not: there
             * is no path that un-asks a question, so a screen reader announcing
             * "pressed" invites an activation that silently spends another of
             * the day's questions instead of switching it off. Which question
             * is answered is stated as a heading in the result below, in text,
             * where it also serves the sighted low-vision case that an amber
             * tint alone was failing.
             *
             * A radio group or a tab list would be worse, not better: both bind
             * arrow keys to selection, so arrowing across four chips would fire
             * four paid, capped requests.
             */
            /*
             * `aria-disabled`, not `disabled`. HTML `disabled` takes the chip
             * out of the tab order, so a keyboard user heading for it lands on
             * the timezone select instead and nothing explains where it went —
             * and `aria-describedby` cannot be read off an unfocusable element.
             * This keeps the chip reachable, so focusing it speaks the reason.
             *
             * It is also the same mechanism that already bit this file once:
             * disabling the element holding focus drops focus to `<body>`,
             * which is why nothing here disables while a request is in flight.
             */
            aria-disabled={blocked !== '' || undefined}
            aria-describedby={blocked !== '' ? reasonId : undefined}
            onClick={() => {
              // `aria-disabled` is a promise to assistive tech, not an
              // enforcement — the click still arrives, so it is refused here.
              if (blocked !== '') return;
              ask(intent);
            }}
          >
            {NEARBY_QUESTIONS[intent].label}
          </button>
        ))}
      </div>

      {blocked !== '' && (
        <p className="muted tiny" id={reasonId}>
          {blocked}
        </p>
      )}

      {/*
       * The live region, and **only** the live region.
       *
       * It is mounted from first render, empty, and is never `display: none` —
       * a region created in the same commit as its first content is not
       * announced at all, which meant the very first question anyone asked was
       * silent. It looked fine to anyone who tested by pressing a chip twice.
       *
       * `aria-busy` is deliberately absent. It tells assistive tech to withhold
       * updates, and the only thing it would have covered here is
       * "Looking&hellip;" — the one message whose whole job is to be heard
       * while the request is in flight.
       *
       * What it holds is the answer, not the apparatus. `role="status"` is
       * implicitly atomic, so everything inside is re-spoken on every change:
       * with the citations in here, every place name was read twice — once in
       * the model's prose, once as a flattened link title — followed by the
       * attribution and the quota line, on every single answer.
       */}
      <div role="status" className="nearby-live">
        {busy && <p className="muted tiny">Looking&hellip;</p>}

        {error !== '' && <p className="error">{error}</p>}

        {answer !== null && (
          <>
            {/* Names the answer, gives browse-mode a heading to land on, and
                says in text what the current chip says in amber. */}
            <h4 className="nearby-question">{NEARBY_QUESTIONS[answer.intent].label}</h4>
            {/*
             * Rendered as text, never as HTML. A model wrote it and it reaches
             * the page through JSX, which escapes it — stated here because the
             * temptation to "render the markdown it sometimes emits" is exactly
             * how that stops being true.
             */}
            <p className="nearby-answer">{answer.text}</p>
          </>
        )}
      </div>

      {answer !== null && (
        <>
          {/*
           * **The citations are contractual, not decoration.** Grounding with
           * Google Maps requires that sources are shown, that they immediately
           * follow the content they support, and that they are reachable within
           * one interaction (PLAN-V3 §3). All three still hold with these
           * outside the live region: nothing is hidden, moved to a footer or
           * put behind a disclosure — they sit directly beneath the prose in
           * DOM order and on screen, and each is a real link. A screen-reader
           * user reading on from the announced prose meets them next, as links,
           * which is better access than hearing their titles as flat text.
           *
           * The server refuses to return an answer with no places, so there is
           * no path where this list is empty.
           */}
          <ul className="nearby-places">
            {answer.places.map((place) => (
              <li key={place.uri}>
                <a href={place.uri} target="_blank" rel="noreferrer">
                  {place.title}
                </a>
              </li>
            ))}
          </ul>

          <p className="muted tiny">
            {/* "Google Maps" may not be recapitalised, localised, or wrapped
                onto two lines — hence the nowrap. */}
            Places from <span className="nowrap">Google Maps</span>, written by AI. Worth
            checking before you go.
          </p>

          {/*
           * Quiet until it matters, which is the value this app just settled
           * on: the count is noise at 25 and useful at 3.
           */}
          {remaining !== null && remaining <= 3 && (
            <p className="muted tiny">
              {remaining === 0
                ? 'That is the last question for today.'
                : `${remaining} more question${remaining === 1 ? '' : 's'} today.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
