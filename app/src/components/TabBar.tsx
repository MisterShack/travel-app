import { NavLink } from 'react-router-dom';
import { AccountIcon, InboxIcon, PassesIcon, TripsIcon } from '@/components/Icons';

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
        <span>
          Inbox
          {/*
            The count is announced, not drawn twice. The badge riding the icon
            is `aria-hidden`, so without this a screen reader hears only
            "Inbox" and the one number on the screen that matters is the one it
            cannot say. Visually hidden rather than inline: rendered, this read
            "Inbox (3 awaiting review)" inside a tab a third of a phone wide.
          */}
          {pending > 0 && <span className="visually-hidden"> — {pending} awaiting review</span>}
        </span>
      </NavLink>
      {/*
        Passes earn a destination of their own rather than living only under a
        trip. The moment one is needed is at a gate, in a hurry, and "which trip
        was that flight on" is not a question worth asking then.
      */}
      <NavLink to="/passes">
        <span className="tabicon-wrap">
          <PassesIcon />
        </span>
        <span>Passes</span>
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
