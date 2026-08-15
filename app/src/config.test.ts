import { describe, expect, it } from 'vitest';
import { API_BASE_URL, isSameOrigin } from './config';

describe('API_BASE_URL', () => {
  it('resolves to a string, never an unsubstituted placeholder', () => {
    // Guards the silent-failure mode described in config.ts: a build with
    // VITE_API_URL unset ships a client that cannot sign in, and nothing about
    // it looks broken until someone tries. vite.config.ts pins the value under
    // test, so this asserts the substitution happened at all.
    expect(typeof API_BASE_URL).toBe('string');
    expect(API_BASE_URL).not.toContain('VITE_');
    expect(API_BASE_URL).not.toContain('undefined');
  });
});

describe('isSameOrigin', () => {
  it('treats the deployed value as same-origin', () => {
    // `/` is what the Dockerfile sets, and it is the whole deployed shape:
    // one process serving both the client and the API (PLAN.md §9).
    expect(isSameOrigin('/')).toBe(true);
    expect(isSameOrigin('')).toBe(true);
  });

  it('treats an absolute API URL as cross-origin', () => {
    expect(isSameOrigin('https://api.example.com')).toBe(false);
  });
});
