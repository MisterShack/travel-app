import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

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
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  // Every call site passes exactly one control, so injecting the ids here keeps
  // the association correct without every form having to plumb them by hand.
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        ...(hint !== undefined ? { 'aria-describedby': hintId } : {}),
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

export function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p className="error" role="alert" id={id}>
      {children}
    </p>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="banner" role="status">
      {items.map((w) => (
        <div key={w}>{w}</div>
      ))}
    </div>
  );
}
