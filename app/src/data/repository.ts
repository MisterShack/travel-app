import type { TimelineItem, TripSummary } from '@travel/shared';
import { api, OfflineError } from '@/api/client';
import { cacheKeys, readCache, writeCache } from './cache';

/**
 * Read-through access to the API (PLAN.md §8).
 *
 * Every successful read is cached; a read that fails *because there is no
 * network* falls back to the cached copy and says so. A read that fails because
 * the server rejected it does not — a 401 or a 404 is an answer, and showing a
 * stale timeline in response to "you are signed out" would be a lie.
 *
 * The `stale` flag is not decoration. A traveller looking at an itinerary needs
 * to know whether they are seeing what the server has or what their phone
 * remembered, because the two differ exactly when someone else has just changed
 * the plan.
 */

export type Loaded<T> = {
  data: T;
  /** True when this came from the cache because the network was unreachable. */
  stale: boolean;
  /** When the cached copy was taken. Only set when `stale`. */
  savedAt?: string;
};

async function readThrough<T>(key: string, userId: string, fetcher: () => Promise<T>): Promise<Loaded<T>> {
  try {
    const data = await fetcher();
    await writeCache(key, userId, data);
    return { data, stale: false };
  } catch (error) {
    if (!(error instanceof OfflineError)) throw error;

    const cached = await readCache<T>(key, userId);
    if (!cached) throw error;
    return { data: cached.data, stale: true, savedAt: cached.savedAt };
  }
}

export function loadTrips(userId: string): Promise<Loaded<TripSummary[]>> {
  return readThrough(cacheKeys.trips, userId, async () => {
    const { trips } = await api.get<{ trips: TripSummary[] }>('/trips');
    return trips;
  });
}

export type TripDetail = {
  trip: TripSummary & { role: 'owner' | 'member' };
  members: {
    userId: string;
    email: string;
    role: string;
    remindersEnabled: string;
    joinedAt: string;
  }[];
};

export function loadTrip(tripId: string, userId: string): Promise<Loaded<TripDetail>> {
  return readThrough(cacheKeys.trip(tripId), userId, () => api.get<TripDetail>(`/trips/${tripId}`));
}

export function loadTimeline(tripId: string, userId: string): Promise<Loaded<TimelineItem[]>> {
  return readThrough(cacheKeys.timeline(tripId), userId, async () => {
    const { items } = await api.get<{ items: TimelineItem[] }>(`/trips/${tripId}/timeline`);
    return items;
  });
}
