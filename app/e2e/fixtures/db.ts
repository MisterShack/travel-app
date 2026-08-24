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

/**
 * The one row a spec just created, straight from the suite's database.
 *
 * Specs assert against this as well as against the screen, because the derived
 * UTC instant is the whole point of PLAN.md §4 and it is never rendered. A
 * timeline that reads correctly and a database holding an instant an hour out
 * look identical, and it stays that way until someone travels — which is
 * exactly the class of defect this suite exists to catch and a unit test in
 * jsdom structurally cannot.
 *
 * Exactly one row, deliberately: "the first row" would quietly pass if a form
 * submitted twice, which is a real failure mode here — the DST warning path
 * stops on a saved row and a second submit must PATCH rather than insert.
 */
export async function onlyRow(
  table: 'segments' | 'lodging' | 'activities',
  tripId: string,
): Promise<Record<string, unknown>> {
  const result = await db().execute({
    sql: `select * from ${table} where trip_id = ?`,
    args: [tripId],
  });
  if (result.rows.length !== 1) {
    throw new Error(
      `expected exactly one ${table} row for ${tripId}, found ${result.rows.length}`,
    );
  }
  return result.rows[0] as unknown as Record<string, unknown>;
}

/**
 * Mints a live `invite` token for a trip and an address, and returns the raw
 * value.
 *
 * The same problem as `mintVerifyToken`, for the same reason: the token exists
 * only in the email that was sent, because `auth_tokens` holds the SHA-256 and
 * nothing else. `listInvites` says so in as many words — "the hash is the
 * handle used to revoke; the token itself was only ever in the email".
 *
 * Note what this does *not* short-circuit. It writes a token, not a membership.
 * Redemption still goes through the real `POST /invites/:token/accept`, so
 * every check that matters — unused, unexpired, the account verified, and the
 * address matching the one the invite was bound to — is exercised exactly as a
 * real link would exercise it.
 */
export async function mintInviteToken(tripId: string, email: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db().execute({
    sql: `insert into auth_tokens (token_hash, user_id, kind, trip_id, email, expires_at, created_at)
          values (?, null, 'invite', ?, ?, ?, ?)`,
    args: [hashToken(token), tripId, email.toLowerCase(), expiresAt.toISOString(), now.toISOString()],
  });

  return token;
}

/** Who is on a trip, and as what. */
export async function membersOf(tripId: string): Promise<{ email: string; role: string }[]> {
  const result = await db().execute({
    sql: `select users.email as email, trip_members.role as role
          from trip_members join users on users.id = trip_members.user_id
          where trip_members.trip_id = ?
          order by trip_members.joined_at`,
    args: [tripId],
  });
  return result.rows.map((r) => ({ email: String(r['email']), role: String(r['role']) }));
}

/** How many rows a trip has of a kind. Zero is a real answer, and often the assertion. */
export async function countRows(
  table: 'segments' | 'lodging' | 'activities',
  tripId: string,
): Promise<number> {
  const result = await db().execute({
    sql: `select count(*) as n from ${table} where trip_id = ?`,
    args: [tripId],
  });
  return Number(result.rows[0]?.['n'] ?? 0);
}

/**
 * Puts a booking import in the review queue, as if one had arrived by email.
 *
 * Seeded rather than ingested. The webhook path — Svix signature, the recipient
 * and verified-sender gates, the daily cap, then heuristics or Gemini — is
 * covered by unit tests and was verified end to end against real forwarded
 * confirmations (Phase 4, and the Via Rail import). What has never had a
 * browser test is the half after that: the review screen, the hand-off into the
 * normal create form, and what happens to a multi-leg booking as its legs are
 * added one at a time. That is what this seeds for, and starting from a
 * `needs_review` row is exactly the state ingest leaves behind.
 *
 * Nothing here writes a timeline row. An import is a proposal until a human
 * saves it through the validated route — which is the rule the spec is checking.
 */
export async function seedImport(
  email: string,
  fields: {
    subject: string;
    fromAddress?: string;
    extractedType: 'segment' | 'lodging' | 'activity';
    extractedFields: Record<string, unknown>;
    tripId?: string | null;
    parsedBy?: 'heuristic' | 'llm' | 'none';
  },
): Promise<string> {
  const userId = await userIdFor(email);
  const id = `imp_${randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();

  await db().execute({
    sql: `insert into booking_imports
            (id, user_id, trip_id, resend_message_id, from_address, subject, received_at,
             status, extracted_type, extracted_fields, parsed_by, applied_segments,
             error_message, processed_at, created_at)
          values (?, ?, ?, ?, ?, ?, ?, 'needs_review', ?, ?, ?, null, null, ?, ?)`,
    args: [
      id,
      userId,
      fields.tripId ?? null,
      // Unique per row: it is the idempotency key for the provider's retries.
      `msg_${randomBytes(8).toString('hex')}`,
      fields.fromAddress ?? 'bookings@airline.test',
      fields.subject,
      now,
      fields.extractedType,
      JSON.stringify(fields.extractedFields),
      fields.parsedBy ?? 'heuristic',
      // Stamped at ingest, which is why it is useless as an "awaiting review"
      // predicate — a mistake this repo made once, in the per-trip route.
      now,
      now,
    ],
  });

  return id;
}

/** An import's status and the legs it has recorded as added. */
export async function importState(id: string): Promise<{ status: string; applied: number[] }> {
  const result = await db().execute({
    sql: 'select status, applied_segments from booking_imports where id = ? limit 1',
    args: [id],
  });
  const row = result.rows[0];
  if (!row) throw new Error(`No booking_imports row for ${id}`);
  const raw = row['applied_segments'];
  return {
    status: String(row['status']),
    applied: typeof raw === 'string' ? (JSON.parse(raw) as number[]) : [],
  };
}
