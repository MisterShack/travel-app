import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Session and email tokens.
 *
 * These are hashed with SHA-256 rather than Argon2, and that is deliberate: a
 * token is 256 bits of `randomBytes`, so there is nothing to guess and no
 * benefit to a slow hash. Passwords are the opposite case — low entropy, so
 * they get Argon2id (see `password.ts`). Hashing at rest still matters here:
 * a leaked database must not contain replayable tokens.
 */

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison, for the rare case two hashes are compared directly. */
export function tokenHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const TOKEN_TTL = {
  /** Long enough to survive a spam folder and a night's sleep. */
  verify: 24 * 60 * 60 * 1000,
  /** Reset links are short-lived. */
  reset: 60 * 60 * 1000,
  /**
   * Long enough to be found in a mailbox and acted on next weekend, short
   * enough that a forgotten invite stops being a live key to someone's trip
   * — including their flight numbers, hotel and dates. Owners can revoke one
   * sooner (PLAN.md §5).
   */
  invite: 7 * 24 * 60 * 60 * 1000,
} as const;

export function expiryFrom(now: Date, ttlMs: number): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

export function isExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
