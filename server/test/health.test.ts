import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from './helpers';
import { loadEnv } from '../src/env';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe('GET /health', () => {
  it('answers 200 with a status body when the database opens', async () => {
    const h = await createHarness();
    cleanup = h.cleanup;
    const res = await h.app.request('/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' });
  });
});

describe('env', () => {
  it('rejects an APP_ORIGIN without a scheme', () => {
    // `new URL('localhost:5173')` parses successfully as scheme "localhost:",
    // so this has to be caught explicitly or the allow-list silently matches
    // no real Origin header.
    expect(() => loadEnv({ APP_ORIGIN: 'localhost:5173' } as NodeJS.ProcessEnv)).toThrow(
      /must be an http\(s\) URL/,
    );
  });

  it('splits a comma-separated APP_ORIGIN', () => {
    const env = loadEnv({
      APP_ORIGIN: 'http://localhost:5173, http://localhost:4173',
    } as NodeJS.ProcessEnv);
    expect(env.APP_ORIGIN).toEqual(['http://localhost:5173', 'http://localhost:4173']);
  });
});

describe('STATIC_DIR', () => {
  it('refuses a relative path rather than resolving it against the cwd', () => {
    // A relative value works from the repo root and silently 404s the entire
    // client under `npm run start --workspace @travel/server`, which runs from
    // server/. The API keeps answering, so nothing looks broken server-side.
    expect(() => loadEnv({ STATIC_DIR: 'app/dist' } as NodeJS.ProcessEnv)).toThrow(
      /must be an absolute path/,
    );
  });

  it('accepts an absolute path, as the Dockerfile sets', () => {
    const env = loadEnv({ STATIC_DIR: '/app/app/dist' } as NodeJS.ProcessEnv);
    expect(env.STATIC_DIR).toBe('/app/app/dist');
  });

  it('stays undefined when unset, so development does not serve stale assets', () => {
    expect(loadEnv({} as NodeJS.ProcessEnv).STATIC_DIR).toBeUndefined();
  });
});

describe('production guards', () => {
  const base = {
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://waypoint.myze.ca',
    PUBLIC_URL: 'https://waypoint.myze.ca',
  };

  it('refuses to start without a mail key', () => {
    // Invite redemption requires a *verified* email (PLAN.md §5), so without
    // mail nobody can join a trip and nobody can finish signing up.
    expect(() => loadEnv(base as NodeJS.ProcessEnv)).toThrow(/RESEND_API_KEY is required/);
  });

  it("refuses the provider's test sender", () => {
    // It accepts the send and delivers only to the account owner, so every
    // invitation would silently reach nobody.
    expect(() =>
      loadEnv({ ...base, RESEND_API_KEY: 'x', MAIL_FROM: 'Trips <a@resend.dev>' } as NodeJS.ProcessEnv),
    ).toThrow(/provider test address/);
  });
});
