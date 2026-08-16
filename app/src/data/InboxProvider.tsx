import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/auth/useAuth';
import { InboxContext } from './inboxContext';

/**
 * How many imports await review.
 *
 * Read on every navigation rather than polled on a timer: it changes when mail
 * arrives, which is rare, and a timer would wake the app up for nothing on a
 * device where battery and signal are scarce. Push tells you about arrivals
 * while you are away; this keeps the badge honest while you are here.
 *
 * It lives in a provider rather than in `App` because reviewing an import does
 * not navigate. Dismissing two of three on the Inbox screen left the badge
 * showing the number it had read on the way in, and nothing on that screen had
 * any way to say otherwise.
 */
export function InboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [pending, setPending] = useState(0);

  const refresh = useCallback(() => {
    if (!user) return setPending(0);
    void api
      .get<{ count: number }>('/imports/count')
      .then((r) => setPending(r.count))
      .catch(() => {
        /* offline or signed out — leave the last known count alone */
      });
  }, [user]);

  useEffect(refresh, [refresh, location.pathname]);

  const value = useMemo(
    () => ({ pending, refresh, report: setPending }),
    [pending, refresh],
  );
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}
