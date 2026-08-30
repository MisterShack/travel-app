import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * End-to-end suite: the real client, in a real browser, against the real API.
 *
 * This exists because the unit suites have been green while the app was wrong.
 * One browser drive found six defects in a single pass — including new events
 * defaulting to the browser's timezone rather than the trip's — and none of
 * them was visible to a test that renders a component in jsdom. `drive.mjs`
 * and `audit.mjs` found nine between them, but they are scripts a person reads.
 * This turns the same coverage into something a machine fails on (PLAN-V2 §5).
 *
 * Two servers, one origin. Vite proxies `/api` and `/health` to the API on
 * 8787, so the browser only ever talks to 5173 — which is the deployed shape,
 * where one process serves both. Testing against two origins would exercise a
 * CORS and cookie configuration that production does not have.
 */

/**
 * A throwaway database per run, created here so both the config and the fixtures
 * agree on the path.
 *
 * It must be a real file rather than `:memory:`: the API runs as a separate
 * process, and the fixtures open the same file directly to mint verification
 * tokens. `mkdtemp` rather than a fixed name so two runs — or a run and a
 * developer's dev server — cannot collide on one SQLite file.
 */
const dataDir = process.env['E2E_DATA_DIR'] ?? mkdtempSync(join(tmpdir(), 'waypoint-e2e-'));
const databaseFile = join(dataDir, 'travel.db');

/**
 * Published to the environment so worker processes agree on it.
 *
 * This file is a module, and Playwright's workers are separate processes that
 * import it again — so `mkdtempSync` above runs once per process, and a fixture
 * that imported `databaseFile` from here got a *different, empty* directory
 * from the one the API was started against. The symptom was
 * `SQLITE_ERROR: no such table: users` from a database that had never been
 * migrated, which reads like a broken migration rather than two files.
 *
 * Workers inherit this, so the assignment is what makes the path shared. The
 * fixtures read the variable rather than importing the constant, so there is no
 * second copy of this decision.
 */
process.env['E2E_DATA_DIR'] = dataDir;

/**
 * Deliberately not 8787/5173.
 *
 * Those are the dev defaults, and a developer running the app while writing a
 * test is the normal case rather than the exception — this suite's first run
 * hit exactly that, against dev servers that had been up for eight days. The
 * second attempt then hit 5174 and 5175, because Vite walks upwards from 5173
 * and this machine had three of them. So these sit well clear of that range
 * rather than one step above it, and both are overridable.
 *
 * Own ports mean `npm run test:e2e` never asks anyone to shut anything down,
 * and can never silently drive the dev database.
 */
const API_PORT = Number(process.env['E2E_API_PORT'] ?? 8799);
const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 5199);

/**
 * `channel: 'chrome'` uses the Chrome already installed, so a contributor does
 * not download a browser to run one spec. CI has no such Chrome, so it falls
 * back to Playwright's bundled Chromium, which its own container image ships.
 */
const useInstalledChrome = !process.env['CI'];

export default defineConfig({
  testDir: './e2e/specs',
  /**
   * Traces and screenshots stay inside the workspace, not in the temp dir with
   * the database. The HTML report links to them by relative path, so putting
   * them somewhere CI does not upload produces a report full of dead links —
   * which is worse than no report, because it looks like one.
   */
  outputDir: 'test-results',

  /**
   * Serial by default. The suite shares one API process and one SQLite file,
   * and SQLite takes a single writer — the same constraint the production app
   * is designed around (PLAN.md §4, §7). Parallelising would buy seconds and
   * cost the ability to trust a failure.
   */
  workers: 1,
  fullyParallel: false,

  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    /**
     * Pinned, and deliberately between the two breakpoints.
     *
     * `devices['Desktop Chrome']` is 1280×720 — 80rem — which since the
     * two-pane layout landed is *desktop*: the trips list stands permanently
     * beside the open trip and opening one is a selection rather than a push.
     * Every spec here was written against the pushed-screen model, so
     * inheriting that width would silently change what 49 specs mean rather
     * than test anything.
     *
     * 900px keeps them on the layout they were written for — one screen at a
     * time, navigation as chips in the header — and says so out loud instead
     * of depending on what a Playwright device preset happens to be. The
     * two-pane layout gets its own project below, at a width where it is real.
     */
    viewport: { width: 900, height: 1000 },
    ...(useInstalledChrome ? { channel: 'chrome' } : {}),
  },

  projects: [
    /** Everything, at the single-column width above. */
    { name: 'chromium', testIgnore: '**/desktop.spec.ts' },
    /**
     * The two-pane layout, which only exists at 72rem and above. A separate
     * project rather than a `test.use` inside one spec, because the width is a
     * property of the whole run: the suite's other specs must not be able to
     * drift into it by accident.
     */
    {
      name: 'desktop',
      testMatch: '**/desktop.spec.ts',
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],

  webServer: [
    {
      /**
       * The API. `NODE_ENV=development` keeps `RESEND_API_KEY` optional —
       * `env.ts` throws without it in production — so no mail credential is
       * needed to run the suite. Mail is never delivered here; the fixtures
       * mint tokens against the database instead of reading a mailbox.
       */
      command: 'npm run start --workspace @travel/server',
      cwd: '..',
      port: API_PORT,
      /**
       * **Never reused, even locally.** A server already listening on 8787 is
       * bound to whatever `DATABASE_URL` it started with — very likely a
       * developer's dev database, or a previous run's temp file. The fixtures
       * open `databaseFile` directly, so a reused server would have the suite
       * writing to one SQLite file and reading from another, and the failure
       * would look like "registration did not create a user" rather than like
       * a configuration mistake.
       *
       * It also keeps the rate limiter honest. `POST /register` allows 10 per
       * 15 minutes per IP and the counter is in-memory, so a reused process
       * carries it across runs: the fourth or fifth `npm run test:e2e` of an
       * afternoon would start failing with 429s that have nothing to do with
       * the code under test. A fresh process starts a fresh window.
       */
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL: `file:${databaseFile}`,
        APP_ORIGIN: `http://localhost:${WEB_PORT}`,
        PUBLIC_URL: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npm run dev --workspace @travel/app -- --port ${WEB_PORT} --strictPort`,
      cwd: '..',
      port: WEB_PORT,
      /**
       * Not reused either. Vite holds no state worth protecting, but it does
       * hold the proxy target: a Vite started for development points `/api` at
       * 8787, and reusing it would send the suite's requests to the dev API.
       */
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
