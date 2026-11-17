"use client";

import type { Day, JournalEntry, Leg, Stop, Trip } from "@beaver/core";
import {
  OfflineTripStore,
  buildCachedTripBundle,
  flushOfflineQueue,
  isOfflineTransportError,
  makeVersionConflictError,
  type CachedTripBundle,
  type FlushResult,
  type OfflinePinStatus,
  type OfflineSyncTransport,
} from "@beaver/offline";
import { apiGet, apiSend } from "@/lib/api";
import { createIdbKv } from "./idb-kv";

let storeSingleton: OfflineTripStore | null = null;

export function getOfflineStore(): OfflineTripStore {
  if (typeof window === "undefined") {
    throw new Error("offline_store_ssr");
  }
  if (!storeSingleton) {
    storeSingleton = new OfflineTripStore(createIdbKv());
  }
  return storeSingleton;
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function webTransport(): OfflineSyncTransport {
  return {
    isOnline: isBrowserOnline,
    uploadMedia: async ({ tripId, contentType, dataBase64 }) => {
      const res = await apiSend<{ key: string; url: string }>("/v1/media", "POST", {
        tripId,
        contentType,
        dataBase64,
      });
      return { key: res.key ?? res.url };
    },
    createJournal: async (tripId, body) => {
      try {
        return await apiSend<{ entry: JournalEntry; tripVersion?: number }>(
          `/v1/trips/${tripId}/journal`,
          "POST",
          body,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("409") || msg.includes("version_conflict")) {
          const match = msg.match(/"serverVersion"\s*:\s*(\d+)/);
          throw makeVersionConflictError(
            msg,
            match ? Number(match[1]) : undefined,
          );
        }
        throw err;
      }
    },
    deleteJournal: async (tripId, entryId, expectedVersion) => {
      try {
        return await apiSend<{ tripVersion?: number }>(
          `/v1/trips/${tripId}/journal/${entryId}`,
          "DELETE",
          expectedVersion === undefined ? undefined : { expectedVersion },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("409") || msg.includes("version_conflict")) {
          const match = msg.match(/"serverVersion"\s*:\s*(\d+)/);
          throw makeVersionConflictError(
            msg,
            match ? Number(match[1]) : undefined,
          );
        }
        throw err;
      }
    },
    fetchTripVersion: async (tripId) => {
      const data = await apiGet<{ trip: Trip }>(`/v1/trips/${tripId}`);
      return data.trip.version;
    },
  };
}

export async function pinTripForOffline(input: {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
  journal: JournalEntry[];
}): Promise<CachedTripBundle> {
  const store = getOfflineStore();
  const bundle = buildCachedTripBundle(input);
  return store.pinTrip(bundle);
}

export async function unpinTripOffline(tripId: string): Promise<void> {
  await getOfflineStore().unpinTrip(tripId);
}

export async function readCachedTrip(
  tripId: string,
): Promise<CachedTripBundle | null> {
  return getOfflineStore().getBundle(tripId);
}

export async function getPinStatus(tripId: string): Promise<OfflinePinStatus> {
  return getOfflineStore().pinStatus(tripId, isBrowserOnline());
}

export async function flushJournalQueue(): Promise<FlushResult> {
  return flushOfflineQueue(getOfflineStore(), webTransport());
}

export async function enqueueJournalCreate(input: {
  tripId: string;
  body: string;
  dayId?: string;
  stopId?: string;
  mediaKeys: string[];
  pendingPhotos: Array<{
    id: string;
    contentType: string;
    dataBase64: string;
  }>;
  expectedVersion?: number;
}): Promise<{ localEntry: JournalEntry; pending: number }> {
  const store = getOfflineStore();
  const stamp = new Date().toISOString();
  const localEntryId = store.createLocalEntryId();
  const localMedia = [
    ...input.mediaKeys,
    ...input.pendingPhotos.map(
      (p) => `data:${p.contentType};base64,${p.dataBase64}`,
    ),
  ];
  const localEntry: JournalEntry = {
    id: localEntryId,
    tripId: input.tripId,
    dayId: input.dayId,
    stopId: input.stopId,
    body: input.body,
    media: localMedia,
    createdAt: stamp,
    updatedAt: stamp,
  };

  await store.enqueue({
    id: store.createMutationId(),
    kind: "journal.create",
    tripId: input.tripId,
    createdAt: stamp,
    localEntryId,
    payload: {
      dayId: input.dayId,
      stopId: input.stopId,
      body: input.body,
      media: input.mediaKeys,
    },
    pendingPhotos: input.pendingPhotos,
    expectedVersion: input.expectedVersion,
  });

  const bundle = await store.getBundle(input.tripId);
  if (bundle) {
    await store.updateCachedJournal(input.tripId, [
      ...bundle.journal,
      localEntry,
    ]);
  }

  const queue = await store.getQueue();
  return {
    localEntry,
    pending: queue.filter((m) => m.tripId === input.tripId).length,
  };
}

export async function enqueueJournalDelete(input: {
  tripId: string;
  entryId: string;
  expectedVersion?: number;
}): Promise<void> {
  const store = getOfflineStore();
  await store.enqueue({
    id: store.createMutationId(),
    kind: "journal.delete",
    tripId: input.tripId,
    createdAt: new Date().toISOString(),
    entryId: input.entryId,
    expectedVersion: input.expectedVersion,
  });
  const bundle = await store.getBundle(input.tripId);
  if (bundle) {
    await store.updateCachedJournal(
      input.tripId,
      bundle.journal.filter((e) => e.id !== input.entryId),
    );
  }
}

export { isOfflineTransportError };
