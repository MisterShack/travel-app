import type { SVGProps } from 'react';
import type { TimelineItem } from '@travel/shared';

/**
 * Every icon in the app, in one file.
 *
 * Two families, deliberately, because they are read at different sizes and in
 * different contexts:
 *
 * - **Navigation icons are stroked** at 22px. A stroke reads as an affordance
 *   and sits comfortably beside a label.
 * - **Kind icons are filled silhouettes** at 18px inside a coloured disc
 *   (`.kind-chip`). A 1.8px stroke inside a 32px disc is thin enough to
 *   disappear at a glance on a phone, and the silhouette is what makes the
 *   flight/stay/activity distinction readable in peripheral vision.
 *
 * Inline rather than a sprite or an `<img>` so they inherit `currentColor`,
 * need no second file for dark mode, and cost no request on a screen that must
 * render with no network.
 */

const stroked: SVGProps<SVGSVGElement> = {
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

const filled: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
  focusable: 'false',
};

/* ------------------------------------------------------------ navigation -- */

/** Trips. A suitcase: luggage, not a chart symbol — see BRAND.md §9. */
export function TripsIcon() {
  return (
    <svg {...stroked}>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
      <path d="M9 7.5V6A1.5 1.5 0 0 1 10.5 4.5h3A1.5 1.5 0 0 1 15 6v1.5" />
    </svg>
  );
}

export function InboxIcon() {
  return (
    <svg {...stroked}>
      <path d="M3 13h4l2 3h6l2-3h4" />
      <path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" />
    </svg>
  );
}

export function AccountIcon() {
  return (
    <svg {...stroked}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function PlusIcon({ size = 20 }: { size?: number }) {
  return (
    <svg {...stroked} width={size} height={size}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

/** Trip settings — sliders rather than a cog: this adjusts a trip, not the app. */
export function ManageIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...stroked} width={size} height={size}>
      <path d="M4 8h9M17.5 8H20M4 16h3.5M12 16h8" />
      <circle cx="15" cy="8" r="2.2" />
      <circle cx="9.5" cy="16" r="2.2" />
    </svg>
  );
}

export function BackIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...stroked} width={size} height={size}>
      <path d="m14 5.5-6.5 6.5L14 18.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ kinds -- */

function FlightIcon() {
  return (
    <svg {...filled}>
      <path d="M12 2.2c.85 0 1.45.75 1.45 1.7v4.85l7.55 4.4v2.05l-7.55-2.15v4.3l2.3 1.75v1.6L12 19.6l-3.75 1.1v-1.6l2.3-1.75v-4.3L3 15.2v-2.05l7.55-4.4V3.9c0-.95.6-1.7 1.45-1.7Z" />
    </svg>
  );
}

function LodgingIcon() {
  return (
    <svg {...filled}>
      <rect x="2.8" y="5.5" width="2.4" height="13" rx="1.2" />
      <rect x="2.8" y="12.2" width="18.4" height="2.6" rx="1.3" />
      <rect x="18.8" y="12.2" width="2.4" height="6.3" rx="1.2" />
      <rect x="7.2" y="7.8" width="4.8" height="3.4" rx="1.7" />
      <path d="M13.2 7.8h4.3a3.7 3.7 0 0 1 3.7 3.7v.2h-8Z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg {...filled} fillRule="evenodd" clipRule="evenodd">
      <path d="M12 2.2a7.2 7.2 0 0 0-7.2 7.2c0 5.2 7.2 12.4 7.2 12.4s7.2-7.2 7.2-12.4A7.2 7.2 0 0 0 12 2.2Zm0 9.85a2.55 2.55 0 1 1 0-5.1 2.55 2.55 0 0 1 0 5.1Z" />
    </svg>
  );
}

const KIND_ICON = {
  flight: FlightIcon,
  lodging: LodgingIcon,
  activity: ActivityIcon,
} as const;

/**
 * The kind's icon on its own tinted disc.
 *
 * `--kind` is set by the `kind-*` class on an ancestor and inherited, so the
 * chip picks up the right hue wherever it is used without being told twice.
 * `aria-hidden`: the kind is always stated in text alongside it.
 */
export function KindChip({
  kind,
  size = '',
}: {
  kind: TimelineItem['kind'];
  size?: '' | 'sm' | 'lg';
}) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={`kind-chip kind-${kind}${size === '' ? '' : ` ${size}`}`}>
      <Icon />
    </span>
  );
}
