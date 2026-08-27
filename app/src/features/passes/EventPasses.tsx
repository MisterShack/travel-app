import { useEffect, useId, useRef, useState } from 'react';
import { MAX_PASS_BYTES, sniffContentType, type Pass, type PassRelatedType } from '@travel/shared';
import { ApiError, OfflineError } from '@/api/client';
import { useAuth } from '@/auth/useAuth';
import { deletePass, fetchPassBytes, loadTripPasses, uploadPass } from '@/data/passes';

/**
 * The passes attached to one event — boarding passes and tickets.
 *
 * It sits on the event's own page, beside "what's nearby", because a pass
 * belongs to the thing it gets you onto: the row you are looking at is the one
 * you will be holding a phone up to at a gate. Passes with no event, and ones
 * belonging to a trip's other rows, live on the Passes page instead.
 *
 * The panel only ever renders for a row the server already has (see
 * `EventForm`) — a pass binds to an id, and a form that has not been saved does
 * not have one yet.
 */

type Props = {
  tripId: string;
  /** Which kind of row this is: the same three a reminder can point at. */
  relatedType: PassRelatedType;
  /** The saved row's id. Never `'new'` — the caller checks that. */
  relatedId: string;
};

/** What the file dialog offers first. A filter, not a check: see `refuse`. */
const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.pkpass,application/pdf,image/png,image/jpeg,application/vnd.apple.pkpass';

/**
 * How long a blob URL is left alive after the browser has been handed it.
 *
 * Revoking on the next line is the tidy-looking version and it cancels the
 * download in Chrome and Safari — the URL has to outlive the fetch the browser
 * starts from it. Anything still outstanding is revoked on unmount, so leaving
 * this generous costs nothing.
 */
const REVOKE_AFTER_MS = 60_000;

/**
 * What to call the row this panel hangs off — in the traveller's words, not the
 * model's. "Journey" covers all four modes, because a boarding pass belongs to
 * a train as readily as to a flight.
 */
const BELONGS_TO: Record<PassRelatedType, string> = {
  segment: 'this journey',
  lodging: 'this stay',
  activity: 'this booking',
};

/** The ceiling, said the way the server says it, so the two refusals match. */
const MAX_MB = Math.floor(MAX_PASS_BYTES / 1024 / 1024);

/**
 * What to call a pass on screen.
 *
 * `label` is read out of an Apple Wallet pass where there is one and is null
 * otherwise — and is **`undefined`** on a row written by an older build and
 * read back out of the offline cache, which is why this accepts both rather
 * than testing `!== null`.
 */
function passName(pass: Pass): string {
  const label = pass.label ?? '';
  return label.trim() === '' ? (pass.filename ?? 'Pass') : label;
}

/** A refusal the reader can act on. Never a status code, and never an id. */
function refusalOf(error: unknown, fallback: string): string {
  if (error instanceof OfflineError) return 'No connection — this needs one.';
  /*
   * 413, 415 and 409 each arrive with a sentence already written for a person:
   * what the ceiling is, which kinds of file are kept, that the trip is full.
   *
   * A 5xx does not. Its message is the generic "Something went wrong.", which
   * names neither the action nor the pass — useless to anyone who cannot see
   * which row is still there. The caller's own fallback says what failed.
   */
  if (error instanceof ApiError && error.status < 500) return error.message;
  return fallback;
}

export function EventPasses({ tripId, relatedType, relatedId }: Props) {
  const { user, offline } = useAuth();
  const userId = user?.id ?? '';
  const headingId = useId();
  const fileId = useId();
  const hintId = useId();
  const questionId = useId();

  const [passes, setPasses] = useState<Pass[] | null>(null);
  /** True when the list came out of the cache because there was no network. */
  const [stale, setStale] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** The pass whose row is currently asking "remove this?", if any. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** A row whose confirmation was dismissed, so focus can go back to it. */
  const [restore, setRestore] = useState<string | null>(null);

  const fileField = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement | null>());
  /** Blob URLs handed to the browser and not yet revoked. */
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    if (userId === '') return;
    let live = true;
    void loadTripPasses(tripId, userId)
      .then((loaded) => {
        if (!live) return;
        /*
         * Filtered here rather than asked for per event, because the trip's
         * list is the one the offline cache holds — a per-event request would
         * be a second cache key and would answer nothing at a gate. Comparing
         * against a concrete string is also the safe direction for a cached row
         * written before these columns existed: `undefined` matches nothing, so
         * the pass stays on the Passes page instead of appearing on every
         * event.
         */
        setPasses(
          loaded.data.filter((p) => p.relatedType === relatedType && p.relatedId === relatedId),
        );
        setStale(loaded.stale);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setPasses([]);
        setError(
          err instanceof OfflineError
            ? 'Offline — no copy of this trip’s passes has been saved to this device yet.'
            : 'Could not load the passes for this.',
        );
      });
    return () => {
      live = false;
    };
  }, [tripId, userId, relatedType, relatedId]);

  /*
   * Focus follows the confirmation: into it when a row starts asking, and back
   * to that row's Remove button when the question is dismissed. Without the
   * second half, cancelling leaves focus on `<body>` — the button that held it
   * has just been replaced — and the next Tab restarts from the skip link.
   */
  useEffect(() => {
    if (confirming !== null) {
      confirmButton.current?.focus();
      return;
    }
    if (restore === null) return;
    removeButtons.current.get(restore)?.focus();
    setRestore(null);
  }, [confirming, restore]);

  /* Whatever is still outstanding when the screen goes. A blob URL holds the
     whole file in memory until it is revoked, and a pass is megabytes. */
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.length = 0;
    };
  }, []);

  const release = (url: string) => {
    objectUrls.current = objectUrls.current.filter((u) => u !== url);
    URL.revokeObjectURL(url);
  };

  /**
   * Why this file cannot be uploaded, or `''`.
   *
   * **Courtesy, not security.** The server sniffs the bytes again, measures
   * what actually arrived rather than what `file.size` claimed, and is the only
   * thing that can prove a zip is an Apple Wallet pass by finding `pass.json`
   * inside it. All this does is spare an obvious refusal a round trip — on
   * hotel wifi, with a two-megabyte upload, that is a real wait.
   */
  const refuse = async (file: File): Promise<string> => {
    if (offline) return 'No connection — adding a pass needs one.';
    if (file.size > MAX_PASS_BYTES) return `That file is too big. A pass may be up to ${MAX_MB} MB.`;
    // Sixteen bytes is longer than the longest signature. The whole file is
    // deliberately not read: it is about to be sent, and reading it twice on a
    // phone is not free.
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (sniffContentType(head) === null) {
      return 'A pass has to be a PDF, a photo, or an Apple Wallet pass.';
    }
    return '';
  };

  const add = (file: File | undefined) => {
    if (file === undefined || busy) return;
    setError('');
    setNote('');
    void (async () => {
      const reason = await refuse(file);
      if (reason !== '') {
        setError(reason);
        return;
      }
      setBusy(true);
      // Announced, not merely spun at: an upload is the one thing on this panel
      // slow enough for a reader to wonder whether the press registered.
      setNote(`Adding ${file.name}…`);
      try {
        const pass = await uploadPass(tripId, file, { relatedType, relatedId });
        setPasses((prev) => [pass, ...(prev ?? [])]);
        setNote(`Added ${passName(pass)}.`);
      } catch (err: unknown) {
        setNote('');
        setError(refusalOf(err, 'Could not add that pass.'));
      } finally {
        setBusy(false);
        // Otherwise picking the same file again fires no change event, so a
        // retry after a failed upload appears to do nothing at all.
        if (fileField.current !== null) fileField.current.value = '';
      }
    })();
  };

  const open = (pass: Pass) => {
    setError('');
    setNote(`Opening ${passName(pass)}…`);
    void (async () => {
      try {
        const { blob, stale: fromCache } = await fetchPassBytes(pass.id, userId);
        const url = URL.createObjectURL(blob);
        objectUrls.current.push(url);

        /*
         * A download link rather than `window.open`. The bytes are fetched
         * first, so by the time there is a URL the click is no longer a fresh
         * user gesture and a popup blocker takes the window — failing exactly
         * where this matters most, on a phone that has just come back from a
         * slow network. It also matches what the server does with the same
         * file: `Content-Disposition: attachment`, so the device opens the pass
         * rather than this origin rendering it.
         */
        const link = document.createElement('a');
        link.href = url;
        link.download = pass.filename ?? 'pass';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => release(url), REVOKE_AFTER_MS);

        setNote(
          fromCache
            ? `Offline — opened the copy of ${passName(pass)} saved on this device.`
            : `Opened ${passName(pass)}.`,
        );
      } catch (err: unknown) {
        setNote('');
        setError(refusalOf(err, 'Could not open that pass.'));
      }
    })();
  };

  const remove = (pass: Pass) => {
    setError('');
    void (async () => {
      try {
        await deletePass(pass.id);
        setPasses((prev) => (prev ?? []).filter((p) => p.id !== pass.id));
        setConfirming(null);
        setRestore(null);
        setNote(`Removed ${passName(pass)}.`);
        // The row that held focus has gone; the field above the list is the
        // nearest thing that is still there.
        fileField.current?.focus();
      } catch (err: unknown) {
        setNote('');
        setError(refusalOf(err, 'Could not remove that pass.'));
      }
    })();
  };

  return (
    <section className="event-passes" aria-labelledby={headingId}>
      <h3 id={headingId}>Passes</h3>
      <p className="muted tiny">Boarding passes and tickets for {BELONGS_TO[relatedType]}.</p>

      {/* An explicit `htmlFor`, not a wrapped input: a control inside its own
          label folds the label's other content into the field's accessible
          name, and a sibling label without `htmlFor` associates nothing at
          all — a failure invisible in a screenshot. */}
      <div className="field">
        <label className="field-label" htmlFor={fileId}>
          Add a pass
        </label>
        <input
          id={fileId}
          ref={fileField}
          type="file"
          className="pass-file"
          accept={ACCEPT}
          aria-describedby={hintId}
          /* Not `disabled` while uploading. Disabling the control that holds
             focus drops focus to `<body>`, which has bitten this app twice;
             `add` refuses a second file instead. */
          onChange={(e) => add(e.target.files?.[0])}
        />
        <span className="muted tiny" id={hintId}>
          A PDF, a photo, or an Apple Wallet pass, up to {MAX_MB} MB.
        </span>
      </div>

      {/*
        * The live region, mounted empty from first render and never hidden. A
        * region that appears in the same commit as its first message is not
        * announced at all — which is how Phase 10 shipped a silent first
        * answer. No `aria-busy` either: it would suppress "Adding…", the one
        * message whose whole job is to be heard while a request is in flight.
        *
        * `aria-live`, not `role="status"`, which is what every other region in
        * this app uses. Two reasons, both about this screen in particular:
        * "what's nearby" already owns a status region a few hundred pixels
        * below, and `role="status"` is implicitly atomic — so a refusal
        * arriving under a note would re-recite the note with it, every time.
        */}
      <div aria-live="polite" className="passes-live">
        {note !== '' && <p className="muted tiny">{note}</p>}
        {error !== '' && <p className="error">{error}</p>}
      </div>

      {passes === null ? (
        /* A skeleton, not the word "Loading…" (BRAND.md §6b) — and hidden from
           assistive tech rather than announced. Nobody asked for this list; it
           loads as the screen does, and narrating the app's own plumbing would
           talk over the region above, which has something to say. */
        <span className="skeleton pass-skeleton" aria-hidden="true" />
      ) : passes.length === 0 ? (
        <p className="muted tiny">No passes yet.</p>
      ) : (
        <>
          {stale && <p className="muted tiny">Offline — showing the list saved on this device.</p>}
          <ul className="pass-list">
            {passes.map((pass) => (
              <li className="pass-row" key={pass.id}>
                <div className="grow">
                  {/* Every row would otherwise offer a control named exactly
                      "Open", which is no help to anyone listing them. The name
                      is the whole phrase and contains the visible text, which
                      is what WCAG 2.5.3 asks — a visually-hidden suffix would
                      have computed as "OpenBoarding pass". */}
                  <button
                    type="button"
                    className="pass-open"
                    aria-label={`Open ${passName(pass)}`}
                    onClick={() => open(pass)}
                  >
                    {passName(pass)}
                  </button>
                  {pass.source === 'email' && (
                    <p className="muted tiny">Came in on a forwarded email.</p>
                  )}
                </div>

                {confirming === pass.id ? (
                  /*
                   * Inline, never `window.confirm`. That dialog blocks the page
                   * while it is up, cannot be styled, and on an installed PWA
                   * reads as the browser breaking through the app.
                   */
                  /* Escape answers it the same way Cancel does; see the same
                     handler below, which owns the focus restore. */
                  <div
                    className="pass-confirm"
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return;
                      event.stopPropagation();
                      setConfirming(null);
                      setRestore(pass.id);
                    }}
                  >
                    <span className="muted tiny" id={questionId}>
                      Remove this pass?
                    </span>
                    <button
                      type="button"
                      className="danger"
                      ref={confirmButton}
                      aria-label={`Remove ${passName(pass)}`}
                      /* Focus arrives here, so the question is what gets read
                         after the name — the confirmation is otherwise silent
                         to anyone who cannot see the row change. */
                      aria-describedby={questionId}
                      onClick={() => remove(pass)}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      aria-label={`Cancel removing ${passName(pass)}`}
                      onClick={() => {
                        setConfirming(null);
                        setRestore(pass.id);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    ref={(el) => {
                      removeButtons.current.set(pass.id, el);
                    }}
                    aria-label={`Remove ${passName(pass)}`}
                    onClick={() => setConfirming(pass.id)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
