import type { Day, Leg, Stop, Trip } from "@beaver/core";

const DEFAULT_BASE = "http://127.0.0.1:8787";

export function apiBase(): string {
  return (
    process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || DEFAULT_BASE
  );
}

export type TripPayload = {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
};

export async function fetchTrip(id: string): Promise<TripPayload> {
  const res = await fetch(`${apiBase()}/v1/trips/${id}`);
  if (!res.ok) throw new Error(`trip_${res.status}`);
  return (await res.json()) as TripPayload;
}
