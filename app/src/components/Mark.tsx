/**
 * The Waypoint mark (BRAND.md §9): an aeronautical chart waypoint — a triangle
 * with the point at its centroid.
 *
 * Inline rather than an `<img>` so it inherits `currentColor` and needs no
 * second file for dark mode, and so it costs no request on a screen that must
 * render with no network.
 */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M32 9 L56 51 H8 Z"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="35" r="4.2" fill="currentColor" />
    </svg>
  );
}
