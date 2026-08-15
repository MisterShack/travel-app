/**
 * Where the client sends API requests.
 *
 * `/` means same-origin, which is the deployed shape: one process serves both
 * the client and the API. The Dockerfile sets `VITE_API_URL=/` at build time —
 * and this is a **build-time** value, so an unset variable produces a client
 * that builds cleanly, loads, looks entirely healthy, and has no sign-in at
 * all. budget-app lists this as one of two deploy properties that break
 * silently (PLAN.md §9); `config.test.ts` is what stops it happening here.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? '';

/** True when the client talks to its own origin — the deployed configuration. */
export function isSameOrigin(base: string = API_BASE_URL): boolean {
  return base === '/' || base === '';
}
