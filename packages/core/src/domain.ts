/** Domain models for Beaver Plan / 海狸旅行 (Slice A stubs). */

export type MapEngineId = "google" | "amap";
/** Reserved for Phase 2 — do not wire adapters yet. */
export type FutureMapEngineId = "baidu";

export type TripRole = "owner" | "editor" | "viewer";

export type TripMember = {
  tripId: string;
  userId: string;
  role: TripRole;
};

export type Trip = {
  id: string;
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  timezone: string;
  locale: "zh-CN" | "en";
  /** `auto` follows product rules (Google default; Amap in mainland CN). */
  mapEngine: MapEngineId | "auto";
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Day = {
  id: string;
  tripId: string;
  date: string;
  note?: string;
};

export type PlaceRef = {
  engine: MapEngineId;
  enginePlaceId: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  raw?: unknown;
};

export type Stop = {
  id: string;
  dayId: string;
  order: number;
  place: PlaceRef;
  userNote?: string;
  photos: string[];
};

export type TransitStep = {
  instruction: string;
  mode: string;
  durationSec?: number;
};

export type Leg = {
  id: string;
  fromStopId: string;
  toStopId: string;
  mode: "walk" | "transit" | "drive";
  durationSec: number;
  distanceM: number;
  polyline?: string;
  transitSteps: TransitStep[];
};

export type JournalEntry = {
  id: string;
  tripId: string;
  dayId?: string;
  stopId?: string;
  body: string;
  media: string[];
  createdAt: string;
};

export type ShareArtifact = {
  id: string;
  tripId: string;
  templateId: string;
  width: number;
  height: number;
  storageUrl?: string;
  createdAt: string;
};

export type CreateTripInput = {
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  locale?: Trip["locale"];
};
