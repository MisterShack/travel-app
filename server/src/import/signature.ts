import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Svix webhook signature verification, which is what Resend uses.
 *
 * Implemented here rather than pulled in as a dependency: it is one HMAC and a
 * constant-time compare, and PLAN.md §2 keeps this app on plain `fetch` rather
 * than provider SDKs. Doing it by hand also means it is testable without a
 * network.
 *
 * The signed payload is `${id}.${timestamp}.${body}` — the raw body, byte for
 * byte. Re-serialising parsed JSON changes key order and whitespace and would
 * fail every time.
 */

export type SignatureHeaders = {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
};

/** Five minutes, matching Svix's own tolerance. */
const TOLERANCE_MS = 5 * 60 * 1000;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_headers' | 'stale' | 'bad_signature' | 'not_configured' };

export function verifyWebhook(
  secret: string | undefined,
  headers: SignatureHeaders,
  rawBody: string,
  now: Date = new Date(),
): VerifyResult {
  // Refusing outright when unconfigured is deliberate. An inbound route that
  // accepts unsigned requests is an unauthenticated endpoint that fetches
  // attacker-chosen messages and writes rows.
  if (!secret) return { ok: false, reason: 'not_configured' };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: 'missing_headers' };
  }

  // A replay window. Without it a captured request stays valid forever.
  const sent = Number(headers.timestamp) * 1000;
  if (!Number.isFinite(sent) || Math.abs(now.getTime() - sent) > TOLERANCE_MS) {
    return { ok: false, reason: 'stale' };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest('base64');

  /**
   * The header carries a space-separated list of `v1,<sig>` — more than one
   * during a secret rotation. Any match is a pass, and every candidate is
   * compared in constant time so the comparison cannot leak the signature a
   * byte at a time.
   */
  const candidates = headers.signature.split(' ').flatMap((part) => {
    const [version, value] = part.split(',');
    return version === 'v1' && value ? [value] : [];
  });

  const expectedBuf = Buffer.from(expected, 'utf8');
  const matched = candidates.some((candidate) => {
    const buf = Buffer.from(candidate, 'utf8');
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });

  return matched ? { ok: true } : { ok: false, reason: 'bad_signature' };
}
