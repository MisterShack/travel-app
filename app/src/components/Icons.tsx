import type { SVGProps } from 'react';
import type { SegmentMode, TimelineItem } from '@travel/shared';

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

/** A train, seen head-on: the shape a station board uses. */
function RailIcon() {
  return (
    <svg {...filled}>
      <path d="M12 2.2c-3.1 0-6.2.4-6.2 3.3v8.9a3.4 3.4 0 0 0 3.4 3.4l-1.6 1.6v.6h8.8v-.6l-1.6-1.6a3.4 3.4 0 0 0 3.4-3.4V5.5c0-2.9-3.1-3.3-6.2-3.3Zm-4.2 4h8.4v3.9H7.8V6.2Zm1.6 9.1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5.2 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
    </svg>
  );
}

/** A coach in profile — longer than a car, windows along the side. */
function CoachIcon() {
  return (
    <svg {...filled}>
      <path d="M3.4 6.4A2.2 2.2 0 0 1 5.6 4.2h12.8a2.2 2.2 0 0 1 2.2 2.2v8.3a2.2 2.2 0 0 1-2.2 2.2v1.3a1.1 1.1 0 0 1-2.2 0v-1.3H7.8v1.3a1.1 1.1 0 0 1-2.2 0v-1.3a2.2 2.2 0 0 1-2.2-2.2V6.4Zm2.2.5v4.2h12.8V6.9H5.6Zm1.7 7.4a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Zm9.4 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z" />
    </svg>
  );
}

/** A hull on water. */
function FerryIcon() {
  return (
    <svg {...filled}>
      <path d="M11 2.4h2v1.7h3.1a1 1 0 0 1 1 1v3.3l2.3.8a1 1 0 0 1 .6 1.3l-1.9 5a3.4 3.4 0 0 1-1.4-.8 2.4 2.4 0 0 0-3.3 0 2.4 2.4 0 0 1-3.2 0 2.4 2.4 0 0 0-3.3 0 3.4 3.4 0 0 1-1.4.8l-1.9-5a1 1 0 0 1 .6-1.3l2.3-.8V5.1a1 1 0 0 1 1-1H11V2.4Zm-2 3.7v2.6l3-1.1 3 1.1V6.1H9ZM3.2 18.1a3 3 0 0 0 2.2-.9 1.2 1.2 0 0 1 1.7 0 3.6 3.6 0 0 0 4.9 0 1.2 1.2 0 0 1 1.7 0 3.6 3.6 0 0 0 4.9 0 1.2 1.2 0 0 1 1.7 0 3 3 0 0 0 2.2.9v2.1a5 5 0 0 1-3.1-1 5.6 5.6 0 0 1-6.6 0 5.6 5.6 0 0 1-6.6 0 5 5 0 0 1-3 1v-2.1Z" />
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
  segment: FlightIcon,
  lodging: LodgingIcon,
  activity: ActivityIcon,
} as const;

/** A journey's icon comes from how it carries you, not from the fact it is one. */
const MODE_ICON: Record<SegmentMode, () => React.JSX.Element> = {
  air: FlightIcon,
  rail: RailIcon,
  coach: CoachIcon,
  ferry: FerryIcon,
};

/**
 * The kind's icon on its own tinted disc.
 *
 * `--kind` is set by the `kind-*` class on an ancestor and inherited, so the
 * chip picks up the right hue wherever it is used without being told twice.
 * `aria-hidden`: the kind is always stated in text alongside it.
 */
export function KindChip({
  kind,
  mode,
  size = '',
}: {
  kind: TimelineItem['kind'];
  mode?: SegmentMode | null;
  size?: '' | 'sm' | 'lg';
}) {
  const Icon = kind === 'segment' && mode ? MODE_ICON[mode] : KIND_ICON[kind];
  return (
    <span className={`kind-chip kind-${kind}${size === '' ? '' : ` ${size}`}`}>
      <Icon />
    </span>
  );
}
