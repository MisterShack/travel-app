import { openDB, type IDBPDatabase } from 'idb';

/**
 * The offline read cache (PLAN.md §4, §8).
 *
 * The moment this app is most needed — airport, plane, foreign SIM, roaming
 * off — is the moment a server-of-record client shows an empty screen. Every
 * successful read is written here; when a read fails because there is no
 * network, the cached copy is shown behind a banner naming when it was saved.
 *
 * Deliberately **read-only**. There is no offline mutation queue and adding one
 * is out of scope: writes fail honestly rather than being replayed later into a
 * trip someone else has since changed.
 */

const DB_NAME = 'travel-cache';
const STORE = 'reads';
const VERSION = 1;

export type CachedRead<T> = {
  data: T;
  /** ISO instant the copy was fetched, shown to the user in the stale banner. */
  savedAt: string;
  /** Scopes every entry to an account, so signing out cannot leak a timeline. */
  userId: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, VERSION, {
    upgrade(database) {
      database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

export async function readCache<T>(key: string, userId: string): Promise<CachedRead<T> | null> {
  try {
    const entry = (await (await db()).get(STORE, key)) as CachedRead<T> | undefined;
    // A cached entry belonging to a different account is not shown, ever. It is
    // dropped rather than returned — this is the one place a shared device
    // could leak someone else's itinerary.
    if (!entry || entry.userId !== userId) return null;
    return entry;
  } catch {
    // A browser with IndexedDB disabled or a private window that refuses it is
    // a degraded experience, not a broken app.
    return null;
  }
}

export async function writeCache<T>(key: string, userId: string, data: T): Promise<void> {
  try {
    await (await db()).put(STORE, { data, savedAt: new Date().toISOString(), userId }, key);
  } catch {
    // Caching is best-effort; failing to write it must never fail the read that
    // just succeeded.
  }
}

/** Called on sign-out: the next account on this device starts clean. */
export async function clearCache(): Promise<void> {
  try {
    await (await db()).clear(STORE);
  } catch {
    /* nothing to do */
  }
}

export const cacheKeys = {
  trips: 'trips',
  timeline: (tripId: string) => `timeline:${tripId}`,
  trip: (tripId: string) => `trip:${tripId}`,
  passes: 'passes',
  tripPasses: (tripId: string) => `passes:${tripId}`,
};
