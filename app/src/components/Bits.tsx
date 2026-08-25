import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

/**
 * The banner shown when a view is rendering a cached copy because the network
 * was unreachable (PLAN.md §8).
 *
 * Naming the time is the point. "Offline" alone leaves a traveller unsure
 * whether the 06:00 flight they are looking at reflects yesterday's change.
 */
export function StaleBanner({ savedAt }: { savedAt?: string }) {
  const when = savedAt
    ? new Date(savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'earlier';
  // role="status" so the change is announced. A message that is visually
  // obvious and silent to assistive tech is worse than none, because the reader
  // believes they have seen everything on the screen.
  return (
    <p className="banner" role="status">
      Offline — showing the copy saved {when}.
    </p>
  );
}

/**
 * A labelled control, with an optional hint.
 *
 * The label is associated explicitly by id rather than by wrapping the control.
 * Wrapping works for a bare input, but anything else inside the label — a hint,
 * a `<select>`'s options — is folded into the field's **accessible name**, and
 * the name is what a screen reader announces to say which field you are in. A
 * hint belongs in `aria-describedby`, which is read *after* the name and can be
 * skipped; it is a description, not an identity.
 *
 * This was found twice: first as a `<select>` announcing all 306 timezones, and
 * then as an airport field named "From Humberto Delgado Airport, Lisbon —
 * Europe/Lisbon". Doing it by id makes the whole class impossible.
 */
export function Field({
  label,
  children,
  hint,
  describedBy,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  /** An extra element describing this field — a form-level error, typically. */
  describedBy?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  /**
   * Combined, not replaced. Injecting `aria-describedby` here used to overwrite
   * anything the caller had set, so a field with both a hint and an error
   * silently lost one of them — no live instance yet, but it is exactly the
   * trap the next person to associate an error would fall into.
   */
  const described =
    [hint !== undefined ? hintId : null, describedBy ?? null].filter(Boolean).join(' ') || undefined;

  // Every call site passes exactly one control, so injecting the ids here keeps
  // the association correct without every form having to plumb them by hand.
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        ...(described !== undefined ? { 'aria-describedby': described } : {}),
      })
    : children;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hint !== undefined && (
        <span className="muted tiny" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * Moves focus to a message the moment it appears.
 *
 * **Submitting a form left focus on `<body>`.** The submit button disables
 * itself mid-press, so the focused element stops being focusable and the
 * document takes over — and the next Tab starts again from the skip link at the
 * top of the page. That is worst on exactly the path the form deliberately
 * stays put for: a save that succeeded with a DST warning leaves the reader
 * standing nowhere, with the thing they need to read somewhere above them.
 *
 * Focusing the message fixes the focus order *and* guarantees it is read. The
 * live region alone is not enough: `role="alert"` is announced reliably when
 * text is written into a region that already existed, and these are mounted
 * along with their content, which screen readers treat inconsistently. Both are
 * kept — the role for the case where focus does not move, the focus for when it
 * does.
 *
 * Only on the transition into having a message, so a re-render with the same
 * error does not yank focus back from wherever the user has moved to.
 */
function useFocusOnAppear(active: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  const was = useRef(false);
  useEffect(() => {
    if (active && !was.current) ref.current?.focus();
    was.current = active;
  }, [active]);
  return ref;
}

export function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  const ref = useFocusOnAppear(Boolean(children));
  if (!children) return null;
  return (
    <p
      className="error"
      role="alert"
      id={id}
      ref={ref as React.RefObject<HTMLParagraphElement>}
      /* Focusable by script, never by Tab: it is a destination, not a stop. */
      tabIndex={-1}
    >
      {children}
    </p>
  );
}

export function Warnings({ items }: { items: string[] }) {
  const ref = useFocusOnAppear(items.length > 0);
  if (items.length === 0) return null;
  return (
    <div
      className="banner"
      role="status"
      ref={ref as React.RefObject<HTMLDivElement>}
      tabIndex={-1}
    >
      {items.map((w) => (
        <div key={w}>{w}</div>
      ))}
    </div>
  );
}

/**
 * A bottom sheet — the only floating layer in the app (BRAND.md §6b).
 *
 * It exists so that adding something to a trip is one primary action instead of
 * a row of three, which made the user choose a type before they had decided to
 * add anything at all.
 *
 * A dialog that does not manage focus is a dialog only to sighted mouse users:
 * without the trap, Tab walks straight out into the page behind it; without the
 * restore, dismissing it leaves focus on `<body>` and the next Tab starts from
 * the top of the document.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  /**
   * The sheet slid in and vanished on close, because it is mounted
   * conditionally — React removes the node the moment the state says it is
   * gone, so an exit animation has nothing left to run on.
   *
   * So closing is a state of the sheet rather than an instant: `closing` plays
   * the exit, and `onClose` — which unmounts it — is called when the animation
   * finishes. Kept inside `Sheet` so that every caller stays a plain boolean
   * and cannot forget to wait.
   */
  const [closing, setClosing] = useState(false);

  /**
   * **`animation: none` under `prefers-reduced-motion` means `animationend`
   * never fires.** Gating the unmount on that event alone would leave those
   * users unable to close the sheet at all — a motion preference turning into
   * a trap. So the preference is read directly and closes immediately, and the
   * animation path is only for people who asked for animation.
   */
  const requestClose = useCallback(() => {
    const still =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      onClose();
      return;
    }
    setClosing(true);
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestClose();
        return;
      }
      if (e.key !== 'Tab' || panel.current === null) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    // The first focusable, not the first `button` — a sheet whose options are
    // links would otherwise open with focus still behind the backdrop.
    panel.current
      ?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      ?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [requestClose]);

  return (
    <div
      className={`sheet-backdrop${closing ? ' closing' : ''}`}
      // Only a click that both starts and ends on the backdrop dismisses;
      // otherwise a drag that begins on a sheet control and releases outside it
      // closes the sheet under the user's finger.
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
        /*
         * `animationend` bubbles, so a child animating would otherwise unmount
         * the sheet under the user. Only this element's own exit counts, and
         * only while closing — the entry animation fires this too.
         */
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
      >
        <div className="grabber" aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        {children}
        {/* Backdrop and Esc are not discoverable on a phone; a labelled way out
            is the only one some people will find. */}
        <div className="actions">
          <button type="button" className="secondary block" onClick={requestClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Placeholder rows in the shape of what is loading.
 *
 * "Loading…" is one short line that the real content then shoves off the
 * screen; a skeleton holds the layout still and says how much is coming. The
 * live region announces it once, because a screen reader gets nothing at all
 * from a grey rectangle.
 */
export function Skeleton({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-stack" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i} aria-hidden="true">
          <span className="skeleton disc" />
          <span className="lines">
            <span className="skeleton" style={{ width: '60%' }} />
            <span className="skeleton" style={{ width: '35%' }} />
          </span>
        </div>
      ))}
    </div>
  );
}
