import type { ReactNode } from 'react';

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
  return <p className="banner">Offline — showing the copy saved {when}.</p>;
}

/**
 * A labelled control.
 *
 * The control is nested **inside** the `<label>` rather than sitting next to
 * it. Implicit association needs no matching id, cannot drift out of sync, and
 * is what makes the label announce with the field for a screen reader and focus
 * it on click. The first version rendered the two as siblings with no `htmlFor`
 * at all, which associated nothing — caught by a browser driver failing to find
 * a field by its label, which is exactly how a screen-reader user would fail to
 * find it too.
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
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint !== undefined && <span className="muted tiny">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="error">{children}</p>;
}

export function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="banner">
      {items.map((w) => (
        <div key={w}>{w}</div>
      ))}
    </div>
  );
}
