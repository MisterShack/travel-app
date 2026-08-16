import { NavLink } from 'react-router-dom';
import { AccountIcon, InboxIcon, TripsIcon } from '@/components/Icons';

/**
 * Bottom tab bar.
 *
 * The single change that makes a PWA stop feeling like a website. Primary
 * destinations belong within thumb reach at the bottom of a phone, not as links
 * in a header — that is the convention every consumer app has taught people,
 * and being different here costs familiarity for nothing.
 *
 * Hidden when signed out: there is nowhere to go.
 */
export function TabBar({ pending }: { pending: number }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" end>
        <span className="tabicon-wrap">
          <TripsIcon />
        </span>
        <span>Trips</span>
      </NavLink>
      <NavLink to="/imports">
        <span className="tabicon-wrap">
          <InboxIcon />
          {pending > 0 && (
            <span className="count" aria-hidden="true">
              {pending}
            </span>
          )}
        </span>
        <span>Inbox{pending > 0 ? ` (${pending} awaiting review)` : ''}</span>
      </NavLink>
      <NavLink to="/account">
        <span className="tabicon-wrap">
          <AccountIcon />
        </span>
        <span>Account</span>
      </NavLink>
    </nav>
  );
}
