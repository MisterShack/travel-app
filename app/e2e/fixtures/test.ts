import {
  test as base,
  expect,
  type APIRequestContext,
  type PlaywrightWorkerArgs,
} from '@playwright/test';
import { join } from 'node:path';
import { closeDb, isVerified, mintVerifyToken } from './db';
import { dataDir } from './paths';

/**
 * The suite's fixtures.
 *
 * One verified account per worker, signed in, reused across every spec that
 * does not care how it got there. Registering per test would be slower and
 * would run into `POST /register`'s rate limit — 10 per 15 minutes per IP —
 * within a single run.
 */

export type Account = {
  email: string;
  password: string;
};

/** Unique per worker and per run, so reruns never collide on an email. */
export function freshEmail(label = 'e2e'): string {
  return `waypoint+${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export const PASSWORD = 'correct horse battery staple';

/**
 * Registers an account and completes verification through the real routes.
 *
 * The token is minted against the database rather than read from a mailbox or
 * a log — see `db.ts` for why reading it is impossible. Everything else here is
 * the path a real user takes: the same `POST /register`, the same
 * `POST /verify`, and the session cookie the server sets on success.
 */
export async function registerAndVerify(
  request: APIRequestContext,
  email: string,
  password = PASSWORD,
): Promise<Account> {
  const registered = await request.post('/api/auth/register', {
    data: { email, password },
  });
  expect(
    registered.status(),
    `register failed for ${email}: ${await registered.text()}`,
  ).toBe(201);

  const token = await mintVerifyToken(email);
  const verified = await request.post('/api/auth/verify', { data: { token } });
  expect(verified.ok(), `verify failed for ${email}: ${await verified.text()}`).toBe(true);

  // Prove it against the database rather than trusting the 200: the route
  // returns `{ ok: true }` and the thing that matters is the column.
  expect(await isVerified(email), `${email} is still unverified after /verify`).toBe(true);

  return { email, password };
}

type WorkerFixtures = {
  /** A verified account, created once per worker. */
  account: Account;
  /** Path to that account's saved browser storage state. */
  storageStatePath: string;
};

export const test = base.extend<Record<string, never>, WorkerFixtures>({
  account: [
    async ({ playwright }, use, workerInfo) => {
      const request = await playwright.request.newContext({
        baseURL: workerInfo.project.use.baseURL,
      });
      const account = await registerAndVerify(request, freshEmail(`w${workerInfo.workerIndex}`));
      await request.dispose();

      await use(account);
      await closeDb();
    },
    { scope: 'worker' },
  ],

  storageStatePath: [
    async ({ playwright, account }, use, workerInfo) => {
      const path = join(dataDir(), `storage-state-${workerInfo.workerIndex}.json`);
      const request = await playwright.request.newContext({
        baseURL: workerInfo.project.use.baseURL,
      });
      const signedIn = await request.post('/api/auth/login', {
        data: { email: account.email, password: account.password },
      });
      expect(signedIn.ok(), `login failed: ${await signedIn.text()}`).toBe(true);
      await request.storageState({ path });
      await request.dispose();

      await use(path);
    },
    { scope: 'worker' },
  ],
});

export { expect };

/**
 * Seeds a trip through the real API and returns it.
 *
 * Specs that are about *adding an event* create their trip this way rather than
 * driving the trip form again. `trip.spec.ts` owns proving that form works;
 * re-driving it in every other spec buys nothing and makes each of them fail
 * for two unrelated reasons.
 *
 * The `request` fixture inherits `storageState` from `test.use`, so this is the
 * signed-in account rather than a second anonymous context.
 */
export async function createTrip(
  request: APIRequestContext,
  overrides: Partial<{
    name: string;
    destination: string;
    startDate: string;
    endDate: string;
    homeTimezone: string;
  }> = {},
): Promise<{ id: string; name: string; homeTimezone: string }> {
  const input = {
    name: `Trip ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    startDate: '2027-03-01',
    endDate: '2027-03-08',
    homeTimezone: 'Europe/Lisbon',
    ...overrides,
  };

  const created = await request.post('/api/trips', { data: input });
  expect(created.status(), `creating a trip failed: ${await created.text()}`).toBe(201);

  const { id } = (await created.json()) as { id: string };
  expect(id, 'the API created a trip but returned no id').toBeTruthy();
  return { id, name: input.name, homeTimezone: input.homeTimezone };
}

/**
 * Signs an arbitrary account in and returns a storage-state path for it.
 *
 * The `account`/`storageStatePath` worker fixtures give a spec *one* signed-in
 * user, which is all most journeys need. Sharing is the exception that needs
 * two at once: the whole point of an invite is that it crosses accounts, so a
 * spec proving it has to hold both sessions simultaneously rather than sign one
 * out and the other in.
 */
export async function storageStateFor(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  account: Account,
  label: string,
): Promise<string> {
  const path = join(dataDir(), `storage-state-${label}.json`);
  const request = await playwright.request.newContext({ baseURL });
  const signedIn = await request.post('/api/auth/login', {
    data: { email: account.email, password: account.password },
  });
  expect(signedIn.ok(), `login failed for ${account.email}: ${await signedIn.text()}`).toBe(true);
  await request.storageState({ path });
  await request.dispose();
  return path;
}
