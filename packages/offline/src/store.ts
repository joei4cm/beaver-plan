import type { JournalEntry } from "@beaver/core";
import { metaKey, queueKey, tripCacheKey, type OfflineMeta } from "./keys.js";
import type {
  CachedTripBundle,
  KvStore,
  OfflineMutation,
  OfflinePinStatus,
} from "./types.js";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class OfflineTripStore {
  constructor(private readonly kv: KvStore) {}

  async getBundle(tripId: string): Promise<CachedTripBundle | null> {
    const raw = await this.kv.get(tripCacheKey(tripId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedTripBundle;
    } catch {
      return null;
    }
  }

  async listPinnedTripIds(): Promise<string[]> {
    const keys = await this.kv.keys(tripCacheKey(""));
    const ids: string[] = [];
    for (const key of keys) {
      const raw = await this.kv.get(key);
      if (!raw) continue;
      try {
        const bundle = JSON.parse(raw) as CachedTripBundle;
        if (bundle.pinned) ids.push(bundle.tripId);
      } catch {
        /* skip corrupt */
      }
    }
    return ids;
  }

  async pinTrip(bundle: CachedTripBundle): Promise<CachedTripBundle> {
    const next: CachedTripBundle = {
      ...bundle,
      pinned: true,
      pinnedAt: bundle.pinnedAt || new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    };
    await this.kv.set(tripCacheKey(next.tripId), JSON.stringify(next));
    return next;
  }

  async unpinTrip(tripId: string): Promise<void> {
    await this.kv.delete(tripCacheKey(tripId));
  }

  async updateCachedJournal(
    tripId: string,
    journal: JournalEntry[],
  ): Promise<void> {
    const prev = await this.getBundle(tripId);
    if (!prev) return;
    const next: CachedTripBundle = {
      ...prev,
      journal,
      cachedAt: new Date().toISOString(),
    };
    await this.kv.set(tripCacheKey(tripId), JSON.stringify(next));
  }

  async touchTripVersion(tripId: string, version: number): Promise<void> {
    const prev = await this.getBundle(tripId);
    if (!prev) return;
    const next: CachedTripBundle = {
      ...prev,
      trip: { ...prev.trip, version, updatedAt: new Date().toISOString() },
      cachedAt: new Date().toISOString(),
    };
    await this.kv.set(tripCacheKey(tripId), JSON.stringify(next));
  }

  async getQueue(): Promise<OfflineMutation[]> {
    const raw = await this.kv.get(queueKey());
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as OfflineMutation[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async setQueue(queue: OfflineMutation[]): Promise<void> {
    if (queue.length === 0) {
      await this.kv.delete(queueKey());
      return;
    }
    await this.kv.set(queueKey(), JSON.stringify(queue));
  }

  async enqueue(mutation: OfflineMutation): Promise<OfflineMutation> {
    const queue = await this.getQueue();
    queue.push(mutation);
    await this.setQueue(queue);
    return mutation;
  }

  async dequeueById(id: string): Promise<void> {
    const queue = await this.getQueue();
    await this.setQueue(queue.filter((m) => m.id !== id));
  }

  async getMeta(): Promise<OfflineMeta> {
    const raw = await this.kv.get(metaKey());
    if (!raw) return {};
    try {
      return JSON.parse(raw) as OfflineMeta;
    } catch {
      return {};
    }
  }

  async setMeta(meta: OfflineMeta): Promise<void> {
    await this.kv.set(metaKey(), JSON.stringify(meta));
  }

  async pinStatus(
    tripId: string,
    online: boolean,
  ): Promise<OfflinePinStatus> {
    const bundle = await this.getBundle(tripId);
    const queue = await this.getQueue();
    const pending = queue.filter((m) => m.tripId === tripId).length;
    const meta = await this.getMeta();
    return {
      tripId,
      pinned: Boolean(bundle?.pinned),
      pinnedAt: bundle?.pinnedAt,
      cachedAt: bundle?.cachedAt,
      pendingMutations: pending,
      online,
      lastFlushAt: meta.lastFlushAt,
      lastFlushError: meta.lastFlushError,
    };
  }

  createLocalEntryId(): string {
    return `local-${newId()}`;
  }

  createMutationId(): string {
    return newId();
  }
}
