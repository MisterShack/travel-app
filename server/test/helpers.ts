import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { createDb, migrateDb, type Db } from '../src/db/client';
import { loadEnv, type Env } from '../src/env';
import { MemoryMailer } from '../src/mail/mailer';
import { MemoryInboundClient, type ReceivedEmail } from '../src/import/resendInbound';

/**
 * A throwaway database on disk, not `:memory:`.
 *
 * A libsql `:memory:` database is destroyed by the first `db.transaction()` —
 * every table silently disappears and later queries fail with "no such table".
 * Trip creation and invite redemption both use transactions, so that would show
 * up as a cascade of unrelated-looking failures. A real file also exercises the
 * same driver path production does.
 */
export type Harness = {
  db: Db;
  env: Env;
  mailer: MemoryMailer;
  app: ReturnType<typeof buildApp>;
  /** Advance or freeze time without waiting for a token to expire. */
  setNow: (d: Date) => void;
  cleanup: () => void;
};

export async function createHarness(
  overrides: Partial<NodeJS.ProcessEnv> = {},
  messages: Record<string, ReceivedEmail> = {},
): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'travel-test-'));
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: `file:${join(dir, 'test.db')}`,
    APP_ORIGIN: 'http://localhost:5173',
    ...overrides,
  } as NodeJS.ProcessEnv);

  const db = createDb(env.DATABASE_URL);
  await migrateDb(db);

  const mailer = new MemoryMailer();
  const inbound = new MemoryInboundClient(messages);
  let current = new Date('2026-08-15T12:00:00.000Z');
  const app = buildApp({ db, env, mailer, inbound, now: () => current });

  return {
    db,
    env,
    mailer,
    app,
    setNow: (d) => {
      current = d;
    },
    /**
     * Close the connection, then remove the directory — **best effort**.
     *
     * Closing first is right on any platform: a hundred harnesses in a run
     * otherwise leave a hundred connections open. But on Windows the libsql
     * native binding does not release the file handle even after `close()`
     * returns and `client.closed` is true — the `.db` file is still EBUSY and
     * removing its directory fails EPERM. `force` only swallows ENOENT, and
     * retries do not help; the handle is held until the process exits.
     *
     * Measured on 2026-08-17: without this guard every one of the 109 server
     * specs failed on a Windows machine while passing on macOS, and each
     * failure was the cleanup, never the assertion.
     *
     * Deleting the directory is hygiene, not correctness — each harness already
     * gets its own `mkdtemp` directory, so a leftover cannot leak into another
     * test. What the OS temp sweeper collects later is a fair trade for a suite
     * that runs on both machines this project is developed from.
     */
    cleanup: () => {
      db.$client.close();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* see above: the platform is holding the file, not the test. */
      }
    },
  };
}

/**
 * Builds a request against the API, which is mounted under `/api` so it cannot
 * collide with the client's own routes (see `app.ts`). Specs pass the logical
 * path and the prefix is added here, so they stay readable and the prefix lives
 * in one place.
 */
export function jsonRequest(path: string, method: string, body?: unknown, cookie?: string) {
  return new Request(`http://localhost/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Pulls the session cookie out of a Set-Cookie header for the next request. */
export function sessionCookie(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0] ?? '';
}

/** Extracts the `?token=` value from the most recent mail to an address. */
export function tokenFromMail(mailer: MemoryMailer, email: string): string {
  const mail = mailer.lastTo(email);
  if (!mail) throw new Error(`No mail sent to ${email}`);
  const match = /token=([\w-]+)/.exec(mail.text);
  if (!match?.[1]) throw new Error(`No token in mail to ${email}:\n${mail.text}`);
  return match[1];
}

/** Registers, verifies, and returns a signed-in cookie. */
export async function signUp(h: Harness, email: string, password = 'correct horse battery'): Promise<string> {
  await h.app.request(jsonRequest('/auth/register', 'POST', { email, password }));
  const token = tokenFromMail(h.mailer, email);
  const res = await h.app.request(jsonRequest('/auth/verify', 'POST', { token }));
  if (res.status !== 200) throw new Error(`verify failed: ${res.status} ${await res.text()}`);
  return sessionCookie(res);
}
