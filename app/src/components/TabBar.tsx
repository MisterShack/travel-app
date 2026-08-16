import type { SVGProps } from 'react';
import { NavLink } from 'react-router-dom';

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
        <TripsIcon />
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
        <AccountIcon />
        <span>Account</span>
      </NavLink>
    </nav>
  );
}

/* Icons are inline and stroke-only so they inherit colour and need no request
   on a screen that must render with no network. */
const props: SVGProps<SVGSVGElement> = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

function TripsIcon() {
  return (
    <svg {...props}>
      <path d="M4 19h16" />
      <path d="M12 4 20 18H4Z" />
      <circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function InboxIcon() {
  return (
    <svg {...props}>
      <path d="M3 13h4l2 3h6l2-3h4" />
      <path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" />
    </svg>
  );
}
function AccountIcon() {
  return (
    <svg {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
