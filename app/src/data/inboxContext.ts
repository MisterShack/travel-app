import { createContext } from 'react';

export type InboxState = {
  /** How many imports await review. Drives the badge on the Inbox tab. */
  pending: number;
  /** Re-read the count from the server. */
  refresh: () => void;
  /**
   * Report a count the caller already knows.
   *
   * The Inbox screen has just fetched the rows, and the list and the count use
   * the same "awaiting review" predicate on the server, so its length *is* the
   * count. Using it avoids a second request and, more importantly, makes the
   * badge and the list structurally unable to disagree.
   */
  report: (count: number) => void;
};

/**
 * Kept apart from the provider and the hook so each module exports exactly one
 * kind of thing — see `auth/context.ts` for why Fast Refresh cares.
 */
export const InboxContext = createContext<InboxState | null>(null);
