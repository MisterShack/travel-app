import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/auth/useAuth';
import { ErrorText, Skeleton, StaleBanner } from '@/components/Bits';
import { deletePass, fetchPassBytes, loadAllPasses, type PassWithTrip } from '@/data/passes';
import { fileKind, formatSize, groupByTrip, passName } from './format';

/**
 * Every pass the reader holds, across every trip (CLAUDE.md, "Passes shipped
 * 2026-08-27").
 *
 * It exists as a destination of its own because of *when* a pass is needed: at
 * a gate, in a hurry, often with no signal. "Which trip was that flight on"
 * is not a question worth asking then, so the whole set is one list and the
 * trip is a heading rather than a step on the way.
 *
 * Nothing here re-implements fetching or caching — `data/passes.ts` owns the
 * read-through cache and the offline copy of the bytes, and going around it
 * would silently drop exactly the offline path this screen is for.
 */

type Loaded = Awaited<ReturnType<typeof loadAllPasses>>;

/**
 * How long the object URL is kept alive after the hand-off.
 *
 * It cannot be revoked in the same task that starts the download: the browser
 * resolves the URL when the transfer actually begins, which is after this
 * handler returns, and revoking first aborts it. It also cannot be left — an
 * installed PWA stays open for days, and a 2 MB blob per pass opened is a leak
 * that only ever grows.
 */
const REVOKE_AFTER_MS = 60_000;

/**
 * Hands the bytes to the device.
 *
 * A synthetic anchor rather than `window.open`, because the open happens after
 * an `await`: a popup opened outside a user gesture is blocked by every mobile
 * browser, and the failure is silent. `download` also matches what the server
 * already pins on the real route (`Content-Disposition: attachment`), so a PDF
 * goes to Files and a `.pkpass` goes to Wallet rather than being rendered from
 * our own origin, which is the risk `server/src/passes/` exists to close.
 */
function handOff(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Firefox only dispatches a click on an anchor that is in the document.
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

export function PassesPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [state, setState] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  /**
   * One message for both "this came off the device" and "that one is gone".
   * `focus` is separate from the text because only one of them destroyed the
   * reader's place: removing a row unmounts the button they pressed, so focus
   * has to be put somewhere deliberate, while opening a pass leaves the Open
   * button under their finger and moving focus off it would be a theft.
   */
  const [notice, setNotice] = useState<{ text: string; focus: boolean }>({ text: '', focus: false });
  const noticeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (userId === '') return;
    void loadAllPasses(userId)
      .then(setState)
      .catch(() =>
        setLoadError('Could not load your passes, and none are saved on this device yet.'),
      );
  }, [userId]);

  useEffect(() => {
    if (notice.focus) noticeRef.current?.focus();
  }, [notice]);

  const open = useCallback(
    async (pass: PassWithTrip) => {
      const name = passName(pass);
      setActionError('');
      try {
        const { blob, stale } = await fetchPassBytes(pass.id, userId);
        // The server already ran `safeFilename` over this on the way in; the
        // guard is for a cached row that predates the field, where `undefined`
        // would otherwise be saved as a file literally called "undefined".
        const filename =
          typeof pass.filename === 'string' && pass.filename !== '' ? pass.filename : 'pass';
        handOff(blob, filename);
        /*
         * Success is announced, not only failure. Nothing on screen changes
         * when a pass opens — focus stays on the button and the hand-off goes
         * to the browser — so a screen-reader user at a gate got silence and
         * pressed again, which downloads it twice. `focus: false` stands: the
         * message is worth saying, not worth taking focus off the button for.
         */
        setNotice({
          text: stale
            ? `Offline — opening the copy of ${name} saved on this device.`
            : `Opened ${name}.`,
          focus: false,
        });
      } catch {
        // Either there is no network and no saved copy, or the pass has been
        // deleted on another device. Both leave the reader with nothing to
        // open, and saying which would be guessing.
        setActionError(
          `Could not open ${name}. There is no copy on this device, and the server did not send one.`,
        );
      }
    },
    [userId],
  );

  const remove = useCallback(async (pass: PassWithTrip) => {
    const name = passName(pass);
    setActionError('');
    try {
      await deletePass(pass.id);
      // Dropped from the list here rather than by re-reading it: the delete
      // already succeeded, and a refetch would fail offline and leave a row on
      // screen that no longer exists.
      setState((previous) =>
        previous === null
          ? previous
          : { ...previous, data: previous.data.filter((p) => p.id !== pass.id) },
      );
      setNotice({ text: `Removed ${name}.`, focus: true });
    } catch {
      setActionError(`Could not remove ${name}. It is still on the trip.`);
    }
  }, []);

  if (loadError !== '') return <p className="error">{loadError}</p>;
  if (state === null) return <Skeleton rows={3} label="Loading your passes" />;

  const groups = groupByTrip(state.data);

  return (
    <>
      {state.stale && <StaleBanner savedAt={state.savedAt} />}

      <h2 className="screen-title">Passes</h2>
      <p className="muted tiny">
        Every ticket and boarding pass on your trips. Opening one keeps a copy on this device, so it
        opens again with no signal.
      </p>

      {/*
        Mounted from the first render, empty, and hidden by clip rather than by
        `display: none`. A live region that is not in the accessibility tree
        until it has content is announced from its *second* message on — which
        looks fine to anyone who tests it twice, and cost Phase 10 a silent day.
      */}
      <p
        className={notice.text === '' ? 'visually-hidden' : 'banner'}
        role="status"
        ref={noticeRef}
        /* Focusable by script, never by Tab — the same contract `ErrorText`
           keeps: it is a destination, not a stop. */
        tabIndex={-1}
      >
        {notice.text}
      </p>

      <ErrorText>{actionError}</ErrorText>

      {groups.length === 0 && (
        <div className="empty">
          <p>No passes yet.</p>
          <p className="muted">
            There are two ways one arrives. Forward a booking confirmation with the ticket attached,
            and it is kept when the email matches exactly one of your trips. Or add a file to the
            flight, stay or activity it belongs to.
          </p>
        </div>
      )}

      {groups.map((group) => (
        <section className="pass-group" key={group.tripId}>
          <h3>{group.tripName}</h3>
          {/* A list, so assistive tech can say how many passes the trip holds
              and let the reader move between them as items. */}
          <ul className="passes">
            {group.passes.map((pass) => (
              <li className="card pass-row" key={pass.id}>
                <PassRow pass={pass} tripName={group.tripName} onOpen={open} onRemove={remove} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function PassRow({
  pass,
  tripName,
  onOpen,
  onRemove,
}: {
  pass: PassWithTrip;
  tripName: string;
  onOpen: (pass: PassWithTrip) => Promise<void>;
  onRemove: (pass: PassWithTrip) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const promptId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  /**
   * A ref, not state, and not a `disabled` attribute. Disabling the control
   * that has focus drops focus to `<body>` — it has bitten this codebase twice
   * — so a second press is refused here instead of being made unpressable.
   */
  const pending = useRef(false);

  const name = passName(pass);
  /**
   * The accessible name of every control on this row.
   *
   * Five buttons all called "Open" are five identical entries in a screen
   * reader's list of controls, which is the same as having none. The trip is in
   * the name as well as the heading because the heading is not read again when
   * controls are listed out of context, and the same pass label can honestly
   * appear on two different trips.
   *
   * An `aria-label` for the whole phrase rather than a visually-hidden suffix:
   * name computation collapses the leading space, so "Open" plus " Air Canada
   * AC123" announces as "OpenAir Canada AC123". The visible word stays inside
   * the label, which is what WCAG 2.5.3 asks anyway.
   */
  const on = `${name}, ${tripName}`;

  const meta = [fileKind(pass.contentType), formatSize(pass.byteSize)]
    .filter((part) => part !== '')
    .join(' · ');

  useEffect(() => {
    // The buttons swap places when the row asks for confirmation, so whichever
    // control the reader was standing on has just been unmounted. Focus follows
    // the row's state in both directions rather than being left on `<body>`.
    if (confirming) confirmRef.current?.focus();
    else if (wasConfirming.current) removeRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const confirm = () => {
    if (pending.current) return;
    pending.current = true;
    void onRemove(pass).finally(() => {
      pending.current = false;
      // A successful removal unmounts this row, so this only matters when the
      // delete failed: the error is on screen and the row goes back to resting.
      setConfirming(false);
    });
  };

  return (
    <div className="row">
      <div className="grow">
        <div className="title">{name}</div>
        <div className="muted tiny">{meta}</div>
      </div>

      {/*
        Confirmation is a state of the row, not `window.confirm`. A native
        confirm blocks the whole page, cannot be styled or read in the app's own
        voice, and on an installed PWA it is the one dialog that most looks like
        the browser leaking through.
      */}
      {confirming ? (
        /* Escape answers the question the same way Cancel does — it is the
           first key anyone tries, and reusing the handler means the focus
           restore that already works is what runs. */
        <div
          className="pass-actions"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setConfirming(false);
          }}
        >
          <span className="muted tiny" id={promptId}>
            Are you sure?
          </span>
          <button
            className="danger"
            ref={confirmRef}
            aria-label={`Remove ${on}`}
            aria-describedby={promptId}
            onClick={confirm}
          >
            Remove
          </button>
          {/*
            The name has to contain the visible word. "Keep …" read well and was
            wrong: someone driving the phone by voice says "tap Cancel" and
            nothing answers, because no control is called that — and on a phone
            there is no Escape key to fall back on. WCAG 2.5.3 asks for the
            visible label to be *in* the name, and this is the case it exists
            for. It carries the question too, so both answers are read with it.
          */}
          <button
            className="secondary"
            aria-label={`Cancel removing ${on}`}
            aria-describedby={promptId}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="pass-actions">
          <button aria-label={`Open ${on}`} onClick={() => void onOpen(pass)}>
            Open
          </button>
          <button
            className="danger"
            ref={removeRef}
            aria-label={`Remove ${on}`}
            onClick={() => setConfirming(true)}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
