import { WORDMARK_H, WORDMARK_PATH, WORDMARK_W } from './wordmarkPath';

/**
 * The wordmark, drawn rather than set.
 *
 * Waypoint has no pictorial mark, so this *is* the identity (BRAND.md §9) — and
 * until 2026-08-29 it was set in `ui-serif, Georgia, "Iowan Old Style"`, which
 * meant it was not one shape: Georgia on Windows, Iowan Old Style on an iPhone,
 * something else again on Android. A product about to ship the same UI inside
 * iOS and Android shells cannot have its identity change with the device, and
 * that is the argument that chose outlines over any font at all.
 *
 * Newsreader 600 at -0.02em, converted once by `scripts/build-wordmark.mjs`:
 * about 1.6KB over the wire, identical everywhere, no request, and it cannot
 * fail to load — which is exactly the moment a wordmark is doing its job.
 *
 * Sized in `em` off the ink box, so the two rules in `styles.css` that set a
 * font-size on `.wordmark` still govern it and neither had to change.
 * `currentColor` keeps it taking `--accent` in both themes.
 */
export function Wordmark() {
  return (
    <svg
      className="wordmark-mark"
      viewBox={`0 0 ${WORDMARK_W} ${WORDMARK_H}`}
      style={{ height: `${WORDMARK_H / 1000}em`, width: `${WORDMARK_W / 1000}em` }}
      role="img"
      fill="currentColor"
      focusable="false"
    >
      {/*
        The name lives here now, so this is content and must not be
        `aria-hidden`: it is what gives the header's link — and the `<h1>`
        wrapping it — their accessible name. A `<title>` rather than an
        `aria-label` because it is the one form every screen reader agrees on
        for an `svg` with `role="img"`.
      */}
      <title>Waypoint</title>
      <path d={WORDMARK_PATH} />
    </svg>
  );
}
