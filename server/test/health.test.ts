import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';

const env = loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('GET /health', () => {
  it('answers 200 with a status body', async () => {
    const res = await buildApp({ env }).request('/health');
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
