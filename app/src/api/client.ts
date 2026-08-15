import { API_BASE_URL } from '@/config';

/**
 * The API's own URL space. The client owns every other path, so `/trips/:id` in
 * the address bar is the app and `/api/trips/:id` is the data behind it.
 */
const API_PREFIX = '/api';

/**
 * The one place that talks to the API.
 *
 * Cookies are the session, so every request sends credentials. Failures are
 * modelled rather than thrown-and-forgotten: the caller needs to tell "the
 * server said no" apart from "there is no network", because the second one is
 * the case where a cached timeline should be shown instead (PLAN.md §8).
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when the request never reached the server — the offline case. */
export class OfflineError extends Error {
  constructor() {
    super('No connection');
    this.name = 'OfflineError';
  }
}

type Body = Record<string, unknown> | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`.replace(/^\/\//, '/'), {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // fetch only rejects on a network-level failure, which is precisely the
    // distinction the repository needs.
    throw new OfflineError();
  }

  const text = await response.text();
  const payload = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof payload['error'] === 'string' ? payload['error'] : 'error',
      typeof payload['message'] === 'string' ? payload['message'] : 'Something went wrong.',
      payload['issues'],
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: Body) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: Body) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
