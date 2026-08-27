import type { Pass } from '@travel/shared';
import { api, OfflineError } from '@/api/client';
import { cacheKeys, readCache, writeCache } from './cache';
import { readPassBlob, writePassBlob } from './blobs';
import type { Loaded } from './repository';

/** A pass on the Passes page carries the name of the trip it belongs to. */
export type PassWithTrip = Pass & { tripName: string };

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

export function loadAllPasses(userId: string): Promise<Loaded<PassWithTrip[]>> {
  return readThrough(cacheKeys.passes, userId, async () => {
    const { passes } = await api.get<{ passes: PassWithTrip[] }>('/passes');
    return passes;
  });
}

export function loadTripPasses(tripId: string, userId: string): Promise<Loaded<Pass[]>> {
  return readThrough(cacheKeys.tripPasses(tripId), userId, async () => {
    const { passes } = await api.get<{ passes: Pass[] }>(`/trips/${tripId}/passes`);
    return passes;
  });
}

/**
 * The pass itself, as a blob URL the browser can open.
 *
 * **This is the one read that must survive with no network**, which is the
 * whole reason passes are stored rather than linked: the moment you need a
 * boarding pass is the moment you are airside with the radio off. So the bytes
 * are fetched once and kept in IndexedDB, and a later open reads them from
 * there whether the network is there or not.
 *
 * Returns the blob rather than a URL so the caller owns the object URL's
 * lifetime — one created here would leak, because nothing would revoke it.
 */
export async function fetchPassBytes(id: string, userId: string): Promise<{ blob: Blob; stale: boolean }> {
  const cached = await readPassBlob(id, userId);
  try {
    const blob = await api.blob(`/passes/${id}/file`);
    await writePassBlob(id, userId, blob);
    return { blob, stale: false };
  } catch (error) {
    if (!(error instanceof OfflineError) || !cached) {
      // A cached copy is only a fallback for *no network*. A 404 means the pass
      // was deleted, and handing back the bytes we happen to still hold would
      // be showing a pass that no longer exists.
      if (cached && error instanceof OfflineError) return { blob: cached, stale: true };
      throw error;
    }
    return { blob: cached, stale: true };
  }
}

/**
 * Downloads the bytes for every pass on a trip, so they are there later.
 *
 * Called when a trip's passes are listed while online. Listing a pass is a good
 * predictor of needing to open it, and the alternative is discovering at the
 * gate that the file was never on the phone.
 */
export async function warmPassCache(passes: { id: string }[], userId: string): Promise<void> {
  for (const pass of passes) {
    // Best effort and one at a time: this runs behind a screen the user is
    // already reading, and saturating a hotel wifi to prefetch is not a favour.
    try {
      if (await readPassBlob(pass.id, userId)) continue;
      const blob = await api.blob(`/passes/${pass.id}/file`);
      await writePassBlob(pass.id, userId, blob);
    } catch {
      // Offline, or the pass has gone. Neither is worth interrupting a read for.
    }
  }
}

export async function uploadPass(
  tripId: string,
  file: File,
  binding?: { relatedType: string; relatedId: string },
): Promise<Pass> {
  const form = new FormData();
  form.set('file', file);
  if (binding) {
    form.set('relatedType', binding.relatedType);
    form.set('relatedId', binding.relatedId);
  }
  const { pass } = await api.upload<{ pass: Pass }>(`/trips/${tripId}/passes`, form);
  return pass;
}

export async function deletePass(id: string): Promise<void> {
  await api.delete(`/passes/${id}`);
}

export async function bindPass(
  id: string,
  binding: { relatedType: string | null; relatedId: string | null },
): Promise<Pass> {
  const { pass } = await api.patch<{ pass: Pass }>(`/passes/${id}`, binding);
  return pass;
}
