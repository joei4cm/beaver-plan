import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JournalEntry, Leg, Stop } from "@beaver/core";
import {
  buildMapSnapshot,
  mergeJournalEntries,
} from "./snapshot.js";

describe("buildMapSnapshot", () => {
  it("collects stop pins and non-empty polylines", () => {
    const stops: Stop[] = [
      {
        id: "s1",
        dayId: "d1",
        order: 0,
        place: {
          engine: "google",
          enginePlaceId: "p1",
          name: "Temple",
          lat: 35.0,
          lng: 135.7,
        },
        photos: [],
      },
    ];
    const legs: Leg[] = [
      {
        id: "l1",
        fromStopId: "s1",
        toStopId: "s2",
        mode: "walk",
        durationSec: 600,
        distanceM: 400,
        polyline: "35.0,135.7;35.01,135.71",
        transitSteps: [],
      },
      {
        id: "l2",
        fromStopId: "s2",
        toStopId: "s3",
        mode: "transit",
        durationSec: 900,
        distanceM: 2000,
        transitSteps: [],
      },
    ];
    const snap = buildMapSnapshot(stops, legs);
    assert.equal(snap.stopPoints.length, 1);
    assert.equal(snap.stopPoints[0]?.name, "Temple");
    assert.deepEqual(snap.polylines, ["35.0,135.7;35.01,135.71"]);
  });
});

describe("mergeJournalEntries", () => {
  it("last-write-wins by updatedAt", () => {
    const local: JournalEntry[] = [
      {
        id: "a",
        tripId: "t1",
        body: "old",
        media: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const remote: JournalEntry[] = [
      {
        id: "a",
        tripId: "t1",
        body: "new",
        media: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "b",
        tripId: "t1",
        body: "other",
        media: [],
        createdAt: "2026-01-01T01:00:00.000Z",
        updatedAt: "2026-01-01T01:00:00.000Z",
      },
    ];
    const merged = mergeJournalEntries(local, remote);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((e) => e.id === "a")?.body, "new");
  });
});
