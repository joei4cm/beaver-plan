import type { JournalEntry } from "@beaver/core";
import type { OfflineTripStore } from "./store.js";
import {
  isVersionConflictError,
  makeVersionConflictError,
  type FlushResult,
  type OfflineMutation,
  type OfflineSyncTransport,
} from "./types.js";

function parseConflict(err: unknown): {
  conflict: boolean;
  serverVersion?: number;
} {
  if (isVersionConflictError(err)) {
    return { conflict: true, serverVersion: err.serverVersion };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("version_conflict") || msg.includes("409")) {
    const match = msg.match(/"serverVersion"\s*:\s*(\d+)/);
    return {
      conflict: true,
      serverVersion: match ? Number(match[1]) : undefined,
    };
  }
  return { conflict: false };
}

/**
 * Flush queued journal mutations (FIFO).
 * Conflict policy: last-write-wins — on 409, refresh version (if available)
 * and retry once with the server version; if still conflicted, omit
 * expectedVersion so the write lands.
 */
export async function flushOfflineQueue(
  store: OfflineTripStore,
  transport: OfflineSyncTransport,
): Promise<FlushResult> {
  const result: FlushResult = {
    flushed: 0,
    remaining: 0,
    errors: [],
    lastTripVersions: {},
  };

  if (!transport.isOnline()) {
    const queue = await store.getQueue();
    result.remaining = queue.length;
    return result;
  }

  const queue = await store.getQueue();
  const flushedIds: string[] = [];

  for (let i = 0; i < queue.length; i += 1) {
    const mutation = queue[i]!;
    try {
      const tripVersion = await applyMutation(store, transport, mutation);
      if (tripVersion !== undefined) {
        result.lastTripVersions[mutation.tripId] = tripVersion;
        await store.touchTripVersion(mutation.tripId, tripVersion);
      }
      flushedIds.push(mutation.id);
      result.flushed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${mutation.id}: ${message}`);
      // Stop on first hard failure so FIFO order is preserved.
      break;
    }
  }

  const flushedSet = new Set(flushedIds);
  const latest = await store.getQueue();
  const remaining = latest.filter((m) => !flushedSet.has(m.id));
  await store.setQueue(remaining);
  result.remaining = remaining.length;

  await store.setMeta({
    lastFlushAt: new Date().toISOString(),
    lastFlushError: result.errors[0],
  });

  return result;
}

async function applyMutation(
  store: OfflineTripStore,
  transport: OfflineSyncTransport,
  mutation: OfflineMutation,
): Promise<number | undefined> {
  if (mutation.kind === "journal.create") {
    return applyCreate(store, transport, mutation);
  }
  return applyDelete(store, transport, mutation);
}

async function applyCreate(
  store: OfflineTripStore,
  transport: OfflineSyncTransport,
  mutation: Extract<OfflineMutation, { kind: "journal.create" }>,
): Promise<number | undefined> {
  const mediaKeys = [...(mutation.payload.media ?? [])];
  for (const photo of mutation.pendingPhotos) {
    const uploaded = await transport.uploadMedia({
      tripId: mutation.tripId,
      contentType: photo.contentType,
      dataBase64: photo.dataBase64,
    });
    mediaKeys.push(uploaded.key);
  }

  const body = {
    dayId: mutation.payload.dayId,
    stopId: mutation.payload.stopId,
    body: mutation.payload.body,
    media: mediaKeys,
  };

  const run = async (expectedVersion?: number) =>
    transport.createJournal(mutation.tripId, {
      ...body,
      expectedVersion,
    });

  let response;
  try {
    response = await run(mutation.expectedVersion);
  } catch (err) {
    const { conflict, serverVersion } = parseConflict(err);
    if (!conflict) throw err;

    let version = serverVersion;
    if (version === undefined && transport.fetchTripVersion) {
      version = await transport.fetchTripVersion(mutation.tripId);
    }
    try {
      response = await run(version);
    } catch (retryErr) {
      const again = parseConflict(retryErr);
      if (!again.conflict) throw retryErr;
      // True LWW: drop version guard and land the write.
      response = await run(undefined);
    }
  }

  // Replace optimistic local entry with server entry in cache.
  const bundle = await store.getBundle(mutation.tripId);
  if (bundle) {
    const withoutLocal = bundle.journal.filter(
      (e) => e.id !== mutation.localEntryId,
    );
    const nextJournal: JournalEntry[] = [...withoutLocal, response.entry].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt),
    );
    await store.updateCachedJournal(mutation.tripId, nextJournal);
  }

  return response.tripVersion;
}

async function applyDelete(
  store: OfflineTripStore,
  transport: OfflineSyncTransport,
  mutation: Extract<OfflineMutation, { kind: "journal.delete" }>,
): Promise<number | undefined> {
  // Optimistic local entries that never reached the server — drop locally.
  if (mutation.entryId.startsWith("local-")) {
    const bundle = await store.getBundle(mutation.tripId);
    if (bundle) {
      await store.updateCachedJournal(
        mutation.tripId,
        bundle.journal.filter((e) => e.id !== mutation.entryId),
      );
    }
    // Also drop any pending create for this local id.
    const queue = await store.getQueue();
    await store.setQueue(
      queue.filter(
        (m) =>
          !(
            m.kind === "journal.create" &&
            m.localEntryId === mutation.entryId
          ),
      ),
    );
    return undefined;
  }

  const run = async (expectedVersion?: number) =>
    transport.deleteJournal(mutation.tripId, mutation.entryId, expectedVersion);

  let response;
  try {
    response = await run(mutation.expectedVersion);
  } catch (err) {
    const { conflict, serverVersion } = parseConflict(err);
    if (!conflict) throw err;
    let version = serverVersion;
    if (version === undefined && transport.fetchTripVersion) {
      version = await transport.fetchTripVersion(mutation.tripId);
    }
    try {
      response = await run(version);
    } catch (retryErr) {
      const again = parseConflict(retryErr);
      if (!again.conflict) throw retryErr;
      response = await run(undefined);
    }
  }

  const bundle = await store.getBundle(mutation.tripId);
  if (bundle) {
    await store.updateCachedJournal(
      mutation.tripId,
      bundle.journal.filter((e) => e.id !== mutation.entryId),
    );
  }

  return response.tripVersion;
}

/** Detect network-ish failures so callers can enqueue instead of failing hard. */
export function isOfflineTransportError(err: unknown): boolean {
  if (isVersionConflictError(err)) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Network request failed") ||
    msg.includes("net::ERR_") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("offline") ||
    msg.includes("TypeError: Load failed")
  );
}

export { makeVersionConflictError };
