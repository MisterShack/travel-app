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
    <div>
      <label>{label}</label>
      {children}
      {hint !== undefined && <p className="muted tiny">{hint}</p>}
    </div>
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
