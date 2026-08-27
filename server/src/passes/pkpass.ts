import { inflateRawSync } from 'node:zlib';

/**
 * Just enough zip to read `pass.json` out of a PKPASS.
 *
 * A `.pkpass` is a zip holding `pass.json` plus artwork and a signature. Two
 * things are wanted from it and nothing else: proof that a zip-shaped upload
 * really is a pass rather than any other archive that shares its signature, and
 * a label for the Passes page better than `boardingpass(3).pkpass`.
 *
 * Implemented here rather than taken as a dependency, the same way the Svix
 * webhook verification was: the format is a published, frozen layout, this
 * reads about sixty bytes of it, and a zip library is a large amount of code to
 * trust in the one place that handles a file a stranger emailed us.
 *
 * It is deliberately incapable of *extracting* an archive. There is no path
 * handling and nothing is ever written to disk — it finds one known name in the
 * central directory and inflates that single entry into memory, with a ceiling
 * on the result. A zip bomb has nothing to expand into.
 */

/** `pass.json` is a small JSON file; anything claiming otherwise is not one. */
const MAX_PASS_JSON_BYTES = 512 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * The end-of-central-directory record, which is the only fixed point in a zip.
 *
 * It sits at the very end, after a comment of up to 64 KB, so it is found by
 * scanning backwards for its signature rather than by arithmetic.
 */
function findEndOfCentralDirectory(buffer: Buffer): number | null {
  const earliest = Math.max(0, buffer.length - (0xffff + 22));
  for (let at = buffer.length - 22; at >= earliest; at -= 1) {
    if (buffer.readUInt32LE(at) === EOCD_SIGNATURE) return at;
  }
  return null;
}

type Entry = { name: string; compression: number; compressedSize: number; localHeaderOffset: number };

/** Walks the central directory. Returns nothing rather than throwing on junk. */
function readCentralDirectory(buffer: Buffer): Entry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd === null) return [];

  const count = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);
  const entries: Entry[] = [];

  for (let index = 0; index < count; index += 1) {
    // A truncated or lying directory stops the walk; it does not throw. The
    // caller's question is "is this a pass", and "the archive is malformed" is
    // an answer to it.
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== CENTRAL_SIGNATURE) break;

    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8');

    entries.push({
      name,
      compression: buffer.readUInt16LE(at + 10),
      compressedSize: buffer.readUInt32LE(at + 20),
      localHeaderOffset: buffer.readUInt32LE(at + 42),
    });

    at += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Inflates one entry, refusing anything that is not stored or deflated. */
function readEntry(buffer: Buffer, entry: Entry): Buffer | null {
  const at = entry.localHeaderOffset;
  if (at + 30 > buffer.length || buffer.readUInt32LE(at) !== LOCAL_SIGNATURE) return null;

  // The local header repeats the name and extra lengths, and they are allowed to
  // differ from the central directory's — the data starts after *these*.
  const nameLength = buffer.readUInt16LE(at + 26);
  const extraLength = buffer.readUInt16LE(at + 28);
  const start = at + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) return null;

  const raw = buffer.subarray(start, end);
  try {
    if (entry.compression === 0) return raw.length > MAX_PASS_JSON_BYTES ? null : raw;
    if (entry.compression === 8) return inflateRawSync(raw, { maxOutputLength: MAX_PASS_JSON_BYTES });
    return null;
  } catch {
    // Corrupt, or larger than the ceiling. Either way it is not a pass we read.
    return null;
  }
}

export type PkpassSummary = {
  /** A human label — "TAP TP442", "Eurostar 9024". */
  label: string | null;
  /** The barcode's payload, kept so a later phase can render it offline. */
  barcodeMessage: string | null;
  barcodeFormat: string | null;
};

/**
 * Reads a PKPASS, or reports that the bytes are not one.
 *
 * `null` is the answer for every zip that is not a pass, which is what makes
 * this the check the upload route leans on: the magic bytes cannot tell a
 * `.pkpass` from a `.docx`, and the presence of a parseable `pass.json` can.
 */
export function readPkpass(bytes: Buffer): PkpassSummary | null {
  const entries = readCentralDirectory(bytes);
  const entry = entries.find((e) => e.name === 'pass.json');
  if (!entry) return null;

  const raw = readEntry(bytes, entry);
  if (raw === null) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

  /*
   * `barcode` is the deprecated singular and `barcodes` the array that replaced
   * it. Real passes in the wild still carry both, and the ones that carry only
   * the old key are exactly the old passes most likely to be sitting in
   * someone's mailbox.
   */
  const barcodes = Array.isArray(parsed['barcodes']) ? (parsed['barcodes'] as unknown[]) : [];
  const barcode = (barcodes[0] ?? parsed['barcode']) as Record<string, unknown> | undefined;

  const label =
    text(parsed['description']) ??
    text(parsed['organizationName']) ??
    text(parsed['logoText']);

  return {
    label,
    barcodeMessage: barcode ? text(barcode['message']) : null,
    barcodeFormat: barcode ? text(barcode['format']) : null,
  };
}
