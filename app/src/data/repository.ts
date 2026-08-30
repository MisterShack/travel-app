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

/**
 * The next event on a trip, read **only** from what is already cached.
 *
 * Deliberately not a fetch. This exists to put "what is actually next" on the
 * trips list, and that screen is worth nothing if it costs a request per trip
 * — or if it spins on a plane. The timeline is in IndexedDB from the last time
 * the trip was opened, so the honest behaviour when it is not is to say
 * nothing rather than to guess or to load.
 *
 * Items arrive ordered by `startAt`, so the first one not yet past is the
 * answer. Comparing UTC instants rather than local times is the whole reason
 * this is correct across zones: "next" for someone in Lisbon and someone in
 * Ottawa is the same event.
 */
export async function cachedNextEvent(
  tripId: string,
  userId: string,
  now: number,
): Promise<TimelineItem | null> {
  const cached = await readCache<TimelineItem[]>(cacheKeys.timeline(tripId), userId);
  if (cached === null) return null;
  return cached.data.find((item) => Date.parse(item.startAt) >= now) ?? null;
}
