import type { Day, Leg, Stop } from "./domain.js";
import type { LatLng, RouteRequest, RoutingEngine } from "./ports.js";

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
