import { openDB, type IDBPDatabase } from 'idb';

/**
 * The offline store for pass bytes.
 *
 * Kept apart from `cache.ts` deliberately. That store holds JSON reads keyed by
 * an API path and is safe to clear wholesale; this one holds files that are the
 * *point* of the feature — a boarding pass you cannot open airside is not a
 * boarding pass — and its entries are addressed by pass id rather than by the
 * request that fetched them.
 *
 * Its own database, rather than a second store in `travel-cache`, because
 * adding a store means an `upgrade` on a database every existing install
 * already holds at version 1. A new name gets a clean version 1 everywhere and
 * cannot fail halfway through someone's trip.
 *
 * IndexedDB stores `Blob`s natively, so nothing is base64'd on the way in.
 */

const DB_NAME = 'travel-passes';
const STORE = 'files';
const VERSION = 1;

type StoredBlob = {
  blob: Blob;
  savedAt: string;
  /** Scopes every file to an account, exactly as the read cache does. */
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

export async function readPassBlob(id: string, userId: string): Promise<Blob | null> {
  try {
    const entry = (await (await db()).get(STORE, id)) as StoredBlob | undefined;
    // Someone else's pass is never handed back, and it is dropped rather than
    // returned — a shared device is exactly where this would leak.
    if (!entry || entry.userId !== userId) return null;
    return entry.blob;
  } catch {
    return null;
  }
}

export async function writePassBlob(id: string, userId: string, blob: Blob): Promise<void> {
  try {
    await (await db()).put(STORE, { blob, savedAt: new Date().toISOString(), userId } satisfies StoredBlob, id);
  } catch {
    // Storage full, or a private window refusing it. The pass still opened; only
    // the offline copy is lost, and the caller has no better answer than we do.
  }
}

export async function forgetPassBlob(id: string): Promise<void> {
  try {
    await (await db()).delete(STORE, id);
  } catch {
    /* Nothing to do: the row is gone from the server either way. */
  }
}

/** Dropped on sign-out, alongside the read cache, for the same reason. */
export async function clearPassBlobs(): Promise<void> {
  try {
    await (await db()).clear(STORE);
  } catch {
    /* Best effort. */
  }
}
