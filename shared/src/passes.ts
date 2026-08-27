import { z } from 'zod';

/**
 * Boarding passes and tickets, stored as documents.
 *
 * **This reverses PLAN.md §4's "no document or attachment is persisted by this
 * app".** That rule named its own escape hatch — a reversal, not a workaround —
 * and David took it on 2026-08-27, having been shown what it costs: a pass
 * carries a full name, a booking reference and a barcode that will often check
 * someone in or move their seat, and the Railway volume is still the only copy
 * of anything (ROADMAP.md §1). PLAN.md §4 and CLAUDE.md now say so.
 *
 * Everything here is platform-neutral, so the sniffing runs unchanged on the
 * client (to refuse a file before uploading it) and on the server (which is the
 * one that counts).
 */

/**
 * What may be stored, and what a stored pass may be served back as.
 *
 * A closed list, because the danger of accepting a document is not the document
 * — it is serving it back from our own origin later. `text/html` or `image/svg`
 * would be script running against the reader's session cookie. Nothing on this
 * list executes, and the download route pins the header rather than echoing
 * anything the uploader said.
 */
export const passContentTypes = [
  'application/pdf',
  'application/vnd.apple.pkpass',
  'image/png',
  'image/jpeg',
] as const;
export const passContentTypeSchema = z.enum(passContentTypes);
export type PassContentType = z.infer<typeof passContentTypeSchema>;

/**
 * Per file. A PKPASS is tens of kilobytes and an airline PDF a few hundred; two
 * megabytes is a generous ceiling for a real ticket and a low one for anything
 * being used as free file hosting.
 */
export const MAX_PASS_BYTES = 2 * 1024 * 1024;

/** Per trip. The bound is on the database, which is the thing being protected. */
export const MAX_PASSES_PER_TRIP = 40;

/**
 * The first bytes of each accepted format.
 *
 * A PKPASS is a zip, so it shares its signature with every other zip — the
 * route confirms one by finding `pass.json` inside it, which is the only
 * evidence that actually distinguishes the two.
 */
const SIGNATURES: ReadonlyArray<{ type: PassContentType; bytes: readonly number[] }> = [
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'application/vnd.apple.pkpass', bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK\x03\x04
];

/**
 * What a file *is*, read from its own first bytes.
 *
 * **The uploader's `Content-Type` is never believed.** It is a header anyone can
 * write, and the whole point of the allowlist is to decide what we are willing
 * to hand back from our origin — a decision that cannot rest on the word of
 * whoever is uploading. `null` means "not something this app stores", and the
 * route turns that into a refusal rather than a guess.
 */
export function sniffContentType(bytes: Uint8Array): PassContentType | null {
  for (const { type, bytes: signature } of SIGNATURES) {
    if (bytes.length < signature.length) continue;
    if (signature.every((byte, index) => bytes[index] === byte)) return type;
  }
  return null;
}

/** What a pass may be attached to — the same three kinds a reminder points at. */
export const passRelatedTypes = ['segment', 'lodging', 'activity'] as const;
export const passRelatedTypeSchema = z.enum(passRelatedTypes);
export type PassRelatedType = z.infer<typeof passRelatedTypeSchema>;

/**
 * Where a pass belongs.
 *
 * Both null together, or both set together: a pass pointing at an id with no
 * kind is a row nothing can resolve. A pass with neither is *unbound* — it
 * belongs to the trip and shows on the Passes page, which is the honest state
 * for a ticket that arrived before the event was added.
 */
export const passBindingSchema = z
  .object({
    relatedType: passRelatedTypeSchema.nullable(),
    relatedId: z.string().min(1).max(64).nullable(),
  })
  .refine((b) => (b.relatedType === null) === (b.relatedId === null), {
    message: 'A pass is attached to both a kind and an id, or to neither.',
  });
export type PassBinding = z.infer<typeof passBindingSchema>;

/** What the list endpoints return. Never the bytes — those have their own route. */
export const passSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  relatedType: passRelatedTypeSchema.nullable(),
  relatedId: z.string().nullable(),
  filename: z.string(),
  contentType: passContentTypeSchema,
  byteSize: z.number().int().nonnegative(),
  /** Read out of a PKPASS where there is one; the filename otherwise. */
  label: z.string().nullable(),
  source: z.enum(['upload', 'email']),
  createdAt: z.string(),
});
export type Pass = z.infer<typeof passSchema>;

/**
 * A filename fit to store and to put in a `Content-Disposition`.
 *
 * Stripped of everything but its last path segment, so neither a browser nor a
 * future filesystem-backed store can be talked into a path by a name. Quotes
 * and control characters go because the header is quoted, and a name that
 * survives none of that becomes `pass`.
 */
export function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"\\]/g, '').trim();
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'pass' : cleaned.slice(0, 120);
}
