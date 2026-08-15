import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { createDb, migrateDb, type Db } from '../src/db/client';
import { loadEnv, type Env } from '../src/env';
import { MemoryMailer } from '../src/mail/mailer';

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

export async function createHarness(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<Harness> {
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
  let current = new Date('2026-08-15T12:00:00.000Z');
  const app = buildApp({ db, env, mailer, now: () => current });

  return {
    db,
    env,
    mailer,
    app,
    setNow: (d) => {
      current = d;
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function jsonRequest(path: string, method: string, body?: unknown, cookie?: string) {
  return new Request(`http://localhost${path}`, {
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
