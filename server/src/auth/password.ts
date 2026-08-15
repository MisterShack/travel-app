import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id at the library's defaults (memory-hard, ~19 MiB, t=2). Slow on
 * purpose: passwords are low-entropy, so the only defence against an offline
 * attack on a stolen database is making each guess expensive.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    // A malformed or truncated hash is a failed login, not a crash.
    return false;
  }
}
