import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { ApiError, OfflineError } from '@/api/client';
import { clearCache } from './cache';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

const { api } = await import('@/api/client');
const { loadTimeline, loadTrips } = await import('./repository');
const get = vi.mocked(api.get);

const ITEMS = [{ kind: 'flight', id: 'f1', title: 'TAP TP1233' }];

beforeEach(async () => {
  await clearCache();
  get.mockReset();
});

describe('read-through caching', () => {
  it('returns fresh data and caches it', async () => {
    get.mockResolvedValueOnce({ items: ITEMS });
    const result = await loadTimeline('trip1', 'user1');
    expect(result.stale).toBe(false);
    expect(result.data).toEqual(ITEMS);
  });

  it('falls back to the cache when the network is unreachable', async () => {
    // The case the whole feature exists for: airport, plane, roaming off.
    get.mockResolvedValueOnce({ items: ITEMS });
    await loadTimeline('trip1', 'user1');

    get.mockRejectedValueOnce(new OfflineError());
    const result = await loadTimeline('trip1', 'user1');

    expect(result.stale).toBe(true);
    expect(result.data).toEqual(ITEMS);
    // The banner needs a time to name, or "offline" tells the traveller nothing
    // about whether they are looking at yesterday's plan.
    expect(result.savedAt).toBeTruthy();
  });

  it('does NOT fall back when the server rejected the request', async () => {
    // A 401 or 404 is an answer. Showing a stale timeline in response to
    // "you are signed out" would be a lie.
    get.mockResolvedValueOnce({ items: ITEMS });
    await loadTimeline('trip1', 'user1');

    get.mockRejectedValueOnce(new ApiError(401, 'unauthenticated', 'Sign in first.'));
    await expect(loadTimeline('trip1', 'user1')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws when offline with nothing cached', async () => {
    get.mockRejectedValueOnce(new OfflineError());
    await expect(loadTimeline('trip1', 'user1')).rejects.toBeInstanceOf(OfflineError);
  });

  it('never serves one account a cache written by another', async () => {
    // The one place a shared device could leak someone else's itinerary.
    get.mockResolvedValueOnce({ items: ITEMS });
    await loadTimeline('trip1', 'user1');

    get.mockRejectedValueOnce(new OfflineError());
    await expect(loadTimeline('trip1', 'user2')).rejects.toBeInstanceOf(OfflineError);
  });

  it('drops the cache on sign-out', async () => {
    get.mockResolvedValueOnce({ trips: [{ id: 't1' }] });
    await loadTrips('user1');
    await clearCache();

    get.mockRejectedValueOnce(new OfflineError());
    await expect(loadTrips('user1')).rejects.toBeInstanceOf(OfflineError);
  });
});
