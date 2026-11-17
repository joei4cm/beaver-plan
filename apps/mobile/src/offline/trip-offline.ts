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
import {
  createJournalEntry,
  fetchTrip,
  uploadMediaBase64,
} from "../api";
import { createAsyncKv } from "./async-kv";

let storeSingleton: OfflineTripStore | null = null;

export function getOfflineStore(): OfflineTripStore {
  if (!storeSingleton) {
    storeSingleton = new OfflineTripStore(createAsyncKv());
  }
  return storeSingleton;
}

/** Best-effort online probe (no NetInfo dep). */
export function isDeviceOnline(): boolean {
  // Expo web / RN may expose navigator.onLine; assume online if unknown.
  if (typeof navigator !== "undefined" && "onLine" in navigator) {
    return Boolean(navigator.onLine);
  }
  return true;
}

function mobileTransport(): OfflineSyncTransport {
  return {
    isOnline: isDeviceOnline,
    uploadMedia: async ({ tripId, contentType, dataBase64 }) => {
      const res = await uploadMediaBase64({ tripId, contentType, dataBase64 });
      return { key: res.key ?? res.url };
    },
    createJournal: async (tripId, body) => {
      try {
        const res = await createJournalEntry(tripId, body);
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("409") || msg.includes("version_conflict")) {
          throw makeVersionConflictError(msg);
        }
        throw err;
      }
    },
    deleteJournal: async () => {
      // Mobile UI does not delete yet; keep for queue completeness.
      return {};
    },
    fetchTripVersion: async (tripId) => {
      const data = await fetchTrip(tripId);
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
  return getOfflineStore().pinTrip(buildCachedTripBundle(input));
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
  return getOfflineStore().pinStatus(tripId, isDeviceOnline());
}

export async function flushJournalQueue(): Promise<FlushResult> {
  return flushOfflineQueue(getOfflineStore(), mobileTransport());
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

export { isOfflineTransportError };
