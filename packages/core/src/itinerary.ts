import type { Day, Leg, Stop, TransitStep } from "./domain.js";
import type { LatLng, RouteRequest, RoutingEngine } from "./ports.js";
import { decodeSimplePolyline } from "./map/polyline.js";

export function sortStops(stops: Stop[]): Stop[] {
  return [...stops].sort((a, b) => a.order - b.order);
}

export function stopsForDay(stops: Stop[], dayId: string): Stop[] {
  return sortStops(stops.filter((s) => s.dayId === dayId));
}

export function reorderStops(stops: Stop[], dayId: string, orderedIds: string[]): Stop[] {
  const others = stops.filter((s) => s.dayId !== dayId);
  const byId = new Map(stops.filter((s) => s.dayId === dayId).map((s) => [s.id, s]));
  const reordered: Stop[] = [];
  orderedIds.forEach((id, index) => {
    const stop = byId.get(id);
    if (stop) reordered.push({ ...stop, order: index });
  });
  // Append any day stops missing from orderedIds
  for (const stop of byId.values()) {
    if (!orderedIds.includes(stop.id)) {
      reordered.push({ ...stop, order: reordered.length });
    }
  }
  return [...others, ...reordered];
}

export function moveStop(
  stops: Stop[],
  stopId: string,
  toDayId: string,
  toIndex: number,
): Stop[] {
  const moving = stops.find((s) => s.id === stopId);
  if (!moving) return stops;
  const without = stops.filter((s) => s.id !== stopId);
  const targetDay = sortStops(without.filter((s) => s.dayId === toDayId));
  const others = without.filter((s) => s.dayId !== toDayId);
  const next = [...targetDay];
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, {
    ...moving,
    dayId: toDayId,
  });
  return [
    ...others,
    ...next.map((s, order) => ({ ...s, order })),
  ];
}

/** Adjacent stop pairs for a day (in order). */
export function adjacentPairs(stops: Stop[]): Array<[Stop, Stop]> {
  const ordered = sortStops(stops);
  const pairs: Array<[Stop, Stop]> = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    pairs.push([ordered[i]!, ordered[i + 1]!]);
  }
  return pairs;
}

export async function routeAdjacentStops(
  routing: RoutingEngine,
  stops: Stop[],
  mode: RouteRequest["mode"],
  language?: string,
): Promise<Leg[]> {
  const pairs = adjacentPairs(stops);
  const legs: Leg[] = [];
  for (const [from, to] of pairs) {
    const origin: LatLng = { lat: from.place.lat, lng: from.place.lng };
    const destination: LatLng = { lat: to.place.lat, lng: to.place.lng };
    const result = await routing.route({
      origin,
      destination,
      mode,
      language,
    });
    legs.push({
      id: `leg-${from.id}-${to.id}`,
      fromStopId: from.id,
      toStopId: to.id,
      mode,
      durationSec: result.durationSec,
      distanceM: result.distanceM,
      polyline: result.polyline,
      transitSteps: result.transitSteps,
    });
  }
  return legs;
}

export function ensureDays(tripId: string, dates: string[]): Day[] {
  return dates.map((date, i) => ({
    id: `day-${tripId}-${i + 1}`,
    tripId,
    date,
  }));
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `<1 min`;
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Normalize vendor step modes into a small UI vocabulary. */
export function normalizeStepMode(
  mode: string,
): "walk" | "transit" | "transfer" | "drive" | "wait" | "other" {
  const m = mode.trim().toUpperCase();
  if (m === "WALK" || m === "WALKING") return "walk";
  if (m === "TRANSIT" || m === "BUS" || m === "SUBWAY" || m === "TRAIN" || m === "RAIL" || m === "TRAM" || m === "FERRY")
    return "transit";
  if (m === "TRANSFER" || m === "CHANGE") return "transfer";
  if (m === "DRIVE" || m === "DRIVING" || m === "CAR") return "drive";
  if (m === "WAIT" || m === "WAITING") return "wait";
  return "other";
}

/** Short label for a transfer step — prefers line name when present. */
export function formatTransitStepLabel(step: TransitStep): string {
  const kind = normalizeStepMode(step.mode);
  if (kind === "transit" && step.lineName) {
    const from = step.fromStopName;
    const to = step.toStopName;
    if (from && to) return `${step.lineName} · ${from} → ${to}`;
    return step.lineName;
  }
  if (step.instruction.trim()) return step.instruction;
  if (kind === "walk") return "Walk";
  if (kind === "transfer") return "Transfer";
  if (kind === "drive") return "Drive";
  return step.mode;
}

export type PathSegment = {
  mode: ReturnType<typeof normalizeStepMode>;
  /** Raw engine mode string */
  rawMode: string;
  polyline?: string;
  durationSec?: number;
  lineName?: string;
};

/**
 * Map-ready path segments: prefer per-step polylines (mode-styled),
 * else a single segment from the leg polyline + leg mode.
 */
export function legPathSegments(leg: Leg): PathSegment[] {
  const withPoly = leg.transitSteps.filter(
    (s) => s.polyline && decodeSimplePolyline(s.polyline).length >= 2,
  );
  if (withPoly.length > 0) {
    return withPoly.map((s) => ({
      mode: normalizeStepMode(s.mode),
      rawMode: s.mode,
      polyline: s.polyline,
      durationSec: s.durationSec,
      lineName: s.lineName,
    }));
  }
  return [
    {
      mode:
        leg.mode === "walk"
          ? "walk"
          : leg.mode === "drive"
            ? "drive"
            : "transit",
      rawMode: leg.mode.toUpperCase(),
      polyline: leg.polyline,
      durationSec: leg.durationSec,
    },
  ];
}

/** Compact transfer summary for mobile / list rows. */
export function summarizeTransfer(leg: Leg): string {
  if (leg.transitSteps.length === 0) {
    return `${formatDuration(leg.durationSec)} · ${formatDistance(leg.distanceM)} · ${leg.mode}`;
  }
  const parts: string[] = [];
  for (const step of leg.transitSteps) {
    const kind = normalizeStepMode(step.mode);
    if (kind === "transit" && step.lineName) {
      parts.push(step.lineName);
    } else if (kind === "walk") {
      parts.push(
        step.durationSec
          ? `walk ${formatDuration(step.durationSec)}`
          : "walk",
      );
    } else if (kind === "transfer") {
      parts.push("transfer");
    }
  }
  const chain = parts.length > 0 ? parts.join(" → ") : formatTransitStepLabel(leg.transitSteps[0]!);
  return `${formatDuration(leg.durationSec)} · ${chain}`;
}
