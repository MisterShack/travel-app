import type { PassContentType } from '@travel/shared';
import type { PassWithTrip } from '@/data/passes';

/**
 * Turning a stored pass into words on a screen.
 *
 * A sibling module rather than exports from the component, matching
 * `timeline/directions.ts`, `timeline/draft.ts` and `trips/status.ts`. Two
 * reasons, and the second is the real one: Fast Refresh only preserves state
 * for a file that exports components alone, and — as `draft.ts` records — a
 * mapping that lives inside a component is a mapping nobody tests, and a field
 * silently missing from one is invisible until someone forwards the right
 * email.
 *
 * Every reader here accepts `null | undefined`. This screen renders from the
 * IndexedDB cache, so a row written by an older build arrives with fields
 * *missing* rather than null, and a page that throws on a cached row fails
 * exactly where it was built to work.
 */

export type Group = { tripId: string; tripName: string; passes: PassWithTrip[] };

/**
 * What the file is, in the words a traveller uses for it.
 *
 * A MIME type is a fact about the transport and means nothing at a gate;
 * "Apple Wallet pass" tells someone whether tapping this will land in Wallet or
 * in their downloads, which is the only thing they are deciding.
 */
const FILE_KIND: Record<PassContentType, string> = {
  'application/vnd.apple.pkpass': 'Apple Wallet pass',
  'application/pdf': 'PDF',
  'image/png': 'Image',
  'image/jpeg': 'Image',
};

/**
 * The fallback is not decoration. This list can be rendered from the
 * IndexedDB cache, so a row written by an older build can arrive missing a
 * field the current one expects — `undefined`, not `null`. "File" is a true
 * statement about a row we cannot describe; printing the raw value would be
 * printing a MIME type at a user.
 */
export function fileKind(contentType: string | null | undefined): string {
  if (typeof contentType !== 'string') return 'File';
  return FILE_KIND[contentType as PassContentType] ?? 'File';
}

/**
 * A size a person can act on. Never a byte count — "218112" is a number about
 * storage, and the only question being answered here is "will this take a
 * moment on hotel wifi".
 */
export function formatSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  const kb = bytes / 1024;
  if (kb < 1) return 'Under 1 KB';
  // Rounded first, so 1023.6 KB reads as 1.0 MB rather than as "1024 KB".
  return Math.round(kb) < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * What to call a pass on screen.
 *
 * The label is read out of a PKPASS where there is one ("Air Canada AC123"),
 * and it is far better than a filename — an emailed attachment is routinely
 * called `document.pdf`. The filename is the fallback precisely because it is
 * the one thing every pass has.
 */
export function passName(pass: { label?: string | null; filename?: string | null }): string {
  const label = pass.label;
  if (typeof label === 'string' && label.trim() !== '') return label;
  const filename = pass.filename;
  return typeof filename === 'string' && filename.trim() !== '' ? filename : 'Pass';
}


/**
 * Grouped by trip, in the order the trips first appear.
 *
 * The API sorts every pass by `createdAt` descending, so first appearance puts
 * the trip you most recently added a pass to at the top — which is the trip you
 * are most likely to be travelling on — and keeps each trip's own passes newest
 * first without a second sort.
 *
 * **Keyed by trip id, headed by trip name.** Two trips may honestly share a
 * name ("Lisbon", twice); merging them on the name would put one trip's
 * boarding passes under another trip's heading, and a heading that lies is
 * worse than a heading repeated.
 */
export function groupByTrip(passes: PassWithTrip[]): Group[] {
  const groups = new Map<string, Group>();
  for (const pass of passes) {
    const group = groups.get(pass.tripId) ?? {
      tripId: pass.tripId,
      // Cached rows are the reason for the fallback, as above: a heading is
      // required to render and an empty one names nothing.
      tripName: typeof pass.tripName === 'string' && pass.tripName !== '' ? pass.tripName : 'Trip',
      passes: [],
    };
    group.passes.push(pass);
    groups.set(pass.tripId, group);
  }
  return [...groups.values()];
}
