/**
 * Converts "Waypoint" into the single SVG path the app ships as its wordmark.
 *
 * Waypoint has no pictorial mark, so the wordmark *is* the identity (BRAND.md
 * §9) — and a wordmark set in `ui-serif, Georgia, "Iowan Old Style"` is not one
 * shape. It renders as Georgia on Windows, Iowan Old Style on an iPhone and
 * something else again on Android, which is exactly the drift the native shells
 * exist to prevent. Outlines are one shape everywhere, need no request, cost no
 * webfont, and cannot fail to load — which is the moment a wordmark is most
 * needed.
 *
 * Run it when the face, the weight or the tracking changes, never otherwise:
 *
 *     # the instance, from the CSS API rather than a versioned file URL
 *     curl -s -A Mozilla 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@20,600' \
 *       | grep -o 'https://fonts.gstatic.com/[^)]*' | head -1 | xargs curl -sL -o /tmp/wordmark.ttf
 *     npm i --no-save opentype.js
 *     node scripts/build-wordmark.mjs /tmp/wordmark.ttf
 *
 * The font is not vendored here. It is needed for one command every few years,
 * and committing 111KB of binary — plus the OFL licence it would then have to
 * travel with — to a repo that never otherwise reads it is a poor trade. The
 * CSS query above is the stable way back to the exact instance; the file URL it
 * returns carries a version that will not be.
 *
 * `opentype.js` is deliberately not a dependency of any workspace. It is needed
 * once every few years and belongs nowhere near a bundle that has to open on a
 * plane. This is the same bargain `build-icons.py` and `build-airports.py`
 * already make.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

/** Newsreader 600 — see BRAND.md §4 for why this face and not the device's. */
const FACE = 'Newsreader';
const WEIGHT = 600;
/**
 * **Optical size 20, and this is a real choice.**
 *
 * Newsreader is a variable font whose `opsz` axis follows the size it is set
 * at, so there is no single "Newsreader 600" to freeze — the shapes at 20px are
 * sturdier and narrower than the same face at 72px. The header renders this at
 * `--text-lg` on every signed-in screen; the sign-in card renders it once at
 * `--text-2xl`. Freezing where it is seen thousands of times more often is the
 * only defensible answer.
 *
 * The instance URL comes from the Google Fonts CSS API:
 *   https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@20,600
 */
const OPSZ = 20;
/** Where the downloaded instance is, given on the command line. */
const TTF = process.argv[2];
if (TTF === undefined) {
  console.error('usage: node scripts/build-wordmark.mjs <newsreader-opsz20-600.ttf>');
  console.error('see the header for how to fetch that file');
  process.exit(2);
}

/** `-0.02em`, matching what `.wordmark` set when this was live text. */
const TRACKING = -0.02;
/** Units per em. One unit is 0.02px at the size the header draws this. */
const EM = 1000;

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const font = opentype.parse(readFileSync(TTF).buffer);
const path = font.getPath('Waypoint', 0, 0, EM, { kerning: true, letterSpacing: TRACKING });

// The viewBox is the ink itself, so the component can size in `em` from the ink
// box and land exactly where the text it replaced did.
const box = path.getBoundingBox();
const w = Math.round(box.x2 - box.x1);
const h = Math.round(box.y2 - box.y1);
for (const command of path.commands) {
  for (const [x, y] of [
    ['x', 'y'],
    ['x1', 'y1'],
    ['x2', 'y2'],
  ]) {
    if (command[x] !== undefined) {
      command[x] -= box.x1;
      command[y] -= box.y1;
    }
  }
}

const d = path.toPathData(0);

writeFileSync(
  here('../app/src/components/wordmarkPath.ts'),
  `/**
 * "Waypoint" in ${FACE} ${WEIGHT}, optical size ${OPSZ}, tracked ${TRACKING}em, as one path.
 *
 * **Generated — do not hand-edit.** \`node scripts/build-wordmark.mjs\` rebuilds
 * it, and that script carries the reasoning for every constant above.
 *
 * Integers at ${EM} units per em: one unit is 0.02px at the size the header
 * renders this, so the precision is spent where it can be seen and nowhere else.
 * ${d.length} bytes of path, roughly 1.6KB over the wire.
 */
export const WORDMARK_W = ${w};
export const WORDMARK_H = ${h};
export const WORDMARK_PATH =
  '${d}';
`,
);

console.log(`wordmarkPath.ts — ${w}×${h} units, ${d.length} bytes of path data`);
