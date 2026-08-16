import { useContext } from 'react';
import { InboxContext, type InboxState } from './inboxContext';

/** The review queue's count. Throws outside an `InboxProvider`, which is a bug. */
export function useInbox(): InboxState {
  const context = useContext(InboxContext);
  if (!context) throw new Error('useInbox must be used inside an InboxProvider');
  return context;
}
