import type { JournalEntry, Leg, Stop, Trip, Day } from "@beaver/core";
import type { CachedTripBundle, OfflineMapSnapshot } from "./types.js";

/** Build a static map stub from stops + last-known leg polylines. */
export function buildMapSnapshot(
  stops: Stop[],
  legs: Leg[],
): OfflineMapSnapshot {
  return {
    stopPoints: stops.map((s) => ({
      id: s.id,
      lat: s.place.lat,
      lng: s.place.lng,
      name: s.place.name,
    })),
    polylines: legs
      .map((l) => l.polyline)
      .filter((p): p is string => typeof p === "string" && p.length > 0),
  };
}

export function buildCachedTripBundle(input: {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
  journal: JournalEntry[];
  pinnedAt?: string;
  cachedAt?: string;
}): CachedTripBundle {
  const stamp = input.cachedAt ?? new Date().toISOString();
  return {
    tripId: input.trip.id,
    trip: input.trip,
    days: input.days,
    stops: input.stops,
    legs: input.legs,
    journal: input.journal,
    mapSnapshot: buildMapSnapshot(input.stops, input.legs),
    pinned: true,
    pinnedAt: input.pinnedAt ?? stamp,
    cachedAt: stamp,
  };
}

/** Merge optimistic / server journal entries; later updatedAt wins (LWW). */
export function mergeJournalEntries(
  local: JournalEntry[],
  remote: JournalEntry[],
): JournalEntry[] {
  const byId = new Map<string, JournalEntry>();
  for (const e of local) byId.set(e.id, e);
  for (const e of remote) {
    const prev = byId.get(e.id);
    if (!prev || e.updatedAt >= prev.updatedAt) {
      byId.set(e.id, e);
    }
  }
  return [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}
