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

/**
 * A multipart upload.
 *
 * Apart from `post` because the body is not JSON and the `content-type` must
 * be left to the browser: it appends the multipart boundary, and setting the
 * header by hand omits it, which the server then cannot parse.
 */
async function upload<T>(path: string, form: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`.replace(/^\/\//, '/'), {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
  } catch {
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

/**
 * A binary read.
 *
 * The error body is JSON like every other route's, so a failure is parsed the
 * same way — but a *success* must not be, and `request` would have tried.
 */
async function blob(path: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`.replace(/^\/\//, '/'), {
      credentials: 'include',
    });
  } catch {
    throw new OfflineError();
  }

  if (!response.ok) {
    const text = await response.text();
    const payload = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
    throw new ApiError(
      response.status,
      typeof payload['error'] === 'string' ? payload['error'] : 'error',
      typeof payload['message'] === 'string' ? payload['message'] : 'Something went wrong.',
      payload['issues'],
    );
  }

  return response.blob();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  upload,
  blob,
  post: <T>(path: string, body?: Body) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: Body) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
