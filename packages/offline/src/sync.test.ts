import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CreateJournalInput, JournalEntry, Trip } from "@beaver/core";
import { createMemoryKv } from "./memory-kv.js";
import { buildCachedTripBundle } from "./snapshot.js";
import { OfflineTripStore } from "./store.js";
import { flushOfflineQueue, isOfflineTransportError } from "./sync.js";
import {
  makeVersionConflictError,
  type OfflineSyncTransport,
} from "./types.js";

function sampleTrip(version = 1): Trip {
  return {
    id: "trip-1",
    title: "Kyoto",
    timezone: "Asia/Tokyo",
    locale: "zh-CN",
    mapEngine: "auto",
    version,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("flushOfflineQueue", () => {
  it("uploads pending photos then creates journal with LWW on conflict", async () => {
    const store = new OfflineTripStore(createMemoryKv());
    await store.pinTrip(
      buildCachedTripBundle({
        trip: sampleTrip(3),
        days: [],
        stops: [],
        legs: [],
        journal: [],
      }),
    );

    const localId = store.createLocalEntryId();
    await store.enqueue({
      id: store.createMutationId(),
      kind: "journal.create",
      tripId: "trip-1",
      createdAt: new Date().toISOString(),
      localEntryId: localId,
      payload: { body: "from the road", media: [] },
      pendingPhotos: [
        { id: "p1", contentType: "image/jpeg", dataBase64: "abc" },
      ],
      expectedVersion: 3,
    });

    let createCalls = 0;
    const transport: OfflineSyncTransport = {
      isOnline: () => true,
      uploadMedia: async () => ({ key: "media/photo-1" }),
      createJournal: async (_tripId, body) => {
        createCalls += 1;
        if (createCalls === 1) {
          assert.equal(body.expectedVersion, 3);
          throw makeVersionConflictError("conflict", 5);
        }
        assert.equal(body.expectedVersion, 5);
        assert.deepEqual(body.media, ["media/photo-1"]);
        const entry: JournalEntry = {
          id: "server-entry",
          tripId: "trip-1",
          body: body.body,
          media: body.media ?? [],
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        };
        return { entry, tripVersion: 6 };
      },
      deleteJournal: async () => ({ tripVersion: 1 }),
      fetchTripVersion: async () => 5,
    };

    const result = await flushOfflineQueue(store, transport);
    assert.equal(result.flushed, 1);
    assert.equal(result.remaining, 0);
    assert.equal(result.lastTripVersions["trip-1"], 6);
    assert.equal(createCalls, 2);

    const bundle = await store.getBundle("trip-1");
    assert.equal(bundle?.journal.length, 1);
    assert.equal(bundle?.journal[0]?.id, "server-entry");
    assert.equal(bundle?.trip.version, 6);
  });

  it("skips flush when offline", async () => {
    const store = new OfflineTripStore(createMemoryKv());
    await store.enqueue({
      id: "m1",
      kind: "journal.create",
      tripId: "trip-1",
      createdAt: new Date().toISOString(),
      localEntryId: "local-1",
      payload: { body: "x" } satisfies CreateJournalInput,
      pendingPhotos: [],
    });
    const result = await flushOfflineQueue(store, {
      isOnline: () => false,
      uploadMedia: async () => ({ key: "x" }),
      createJournal: async () => {
        throw new Error("should not run");
      },
      deleteJournal: async () => ({}),
    });
    assert.equal(result.flushed, 0);
    assert.equal(result.remaining, 1);
  });
});

describe("isOfflineTransportError", () => {
  it("detects fetch failures", () => {
    assert.equal(
      isOfflineTransportError(new Error("Failed to fetch")),
      true,
    );
    assert.equal(
      isOfflineTransportError(makeVersionConflictError("x", 1)),
      false,
    );
  });
});
