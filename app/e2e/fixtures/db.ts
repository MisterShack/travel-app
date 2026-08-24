import { createClient, type Client } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { databaseFile } from './paths';

/**
 * Direct access to the suite's throwaway database.
 *
 * **Why this exists at all.** PLAN-V2 §5 asked for a fixture that "completes
 * verification by reading the token straight from the test database", to avoid
 * scraping a log — log-scraping is fine for a script a person is watching and
 * wrong for a suite. But the token cannot be read: `auth_tokens` stores only
 * the SHA-256 of it (`server/src/auth/tokens.ts`), deliberately, so that a
 * leaked database yields no working links. There is nothing to read back.
 *
 * So the fixture *mints* instead of reads: it generates a token, writes the
 * hash the server will look for, and hands the raw value to the test. That
 * exercises the real `/api/auth/verify` route — the same lookup, expiry and
 * single-use checks a real link goes through — without a mailbox, a log file,
 * or a hole in the production code for tests to climb through.
 */

let client: Client | undefined;

export function db(): Client {
  client ??= createClient({ url: `file:${databaseFile()}` });
  return client;
}

export async function closeDb(): Promise<void> {
  client?.close();
  client = undefined;
}

/** The same hashing the server does, so the row it looks for is the row we wrote. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function userIdFor(email: string): Promise<string> {
  const result = await db().execute({
    sql: 'select id from users where email = ? limit 1',
    args: [email.toLowerCase()],
  });
  const id = result.rows[0]?.['id'];
  if (typeof id !== 'string') throw new Error(`No user row for ${email}. Did registration fail?`);
  return id;
}

/**
 * Mints a live `verify` token for a user and returns the raw value.
 *
 * Mirrors what `POST /api/auth/register` does, rather than replacing it: the
 * registration route has already written its own token by the time this runs.
 * A second live token is legitimate — they are single-use and independent, and
 * using ours leaves the route's own untouched rather than racing it.
 */
export async function mintVerifyToken(email: string): Promise<string> {
  const userId = await userIdFor(email);
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  await db().execute({
    sql: `insert into auth_tokens (token_hash, user_id, kind, expires_at, created_at)
          values (?, ?, 'verify', ?, ?)`,
    args: [hashToken(token), userId, expiresAt.toISOString(), now.toISOString()],
  });

  return token;
}

/** True once the account's email has been verified. */
export async function isVerified(email: string): Promise<boolean> {
  const result = await db().execute({
    sql: 'select email_verified_at from users where email = ? limit 1',
    args: [email.toLowerCase()],
  });
  return result.rows[0]?.['email_verified_at'] != null;
}
