import type { MapEngineId, PlaceRef } from "./domain.js";

export type LatLng = { lat: number; lng: number };

export type PlaceQuery = {
  text: string;
  near?: LatLng;
  language?: string;
};

export type PlaceSummary = {
  enginePlaceId: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
};

export type PlaceDetails = PlaceSummary & {
  rating?: number;
  openingHours?: string[];
  raw?: unknown;
};

export type Address = {
  formatted: string;
  locality?: string;
  countryCode?: string;
};

/** Map / Places port — Google + Amap adapters land in Slice B. */
export interface MapEngine {
  readonly id: MapEngineId;
  searchPlaces(q: PlaceQuery): Promise<PlaceSummary[]>;
  getPlaceDetails(id: string): Promise<PlaceDetails>;
  reverseGeocode(latLng: LatLng): Promise<Address>;
}

export type RouteRequest = {
  origin: LatLng;
  destination: LatLng;
  mode: "walk" | "transit" | "drive";
  language?: string;
};

export type RouteResult = {
  durationSec: number;
  distanceM: number;
  polyline?: string;
  transitSteps: Array<{
    instruction: string;
    mode: string;
    durationSec?: number;
  }>;
};

/** Directions / transit port — implemented in Slice B. */
export interface RoutingEngine {
  readonly id: MapEngineId;
  route(req: RouteRequest): Promise<RouteResult>;
}

export type CollabInvite = {
  tripId: string;
  email?: string;
  role: "editor" | "viewer";
};

export type CollabSyncResult =
  | { ok: true; version: number }
  | { ok: false; reason: "version_conflict"; serverVersion: number };

/** Collaboration port — invite + version sync; Slice D. */
export interface CollabPort {
  invite(input: CollabInvite): Promise<{ inviteUrl: string }>;
  pushVersion(
    tripId: string,
    expectedVersion: number,
  ): Promise<CollabSyncResult>;
}

export type TranslationMode = "live" | "batch";

export type TranslationRequest = {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  mode: TranslationMode;
};

export type TranslationResult = {
  text: string;
  provider: string;
};

/** Live translation — ASR/TTS/LLM wiring in Slice E. */
export interface TranslationProvider {
  translate(req: TranslationRequest): Promise<TranslationResult>;
}

/** Stub map engine so apps can depend on the port today. */
export class StubMapEngine implements MapEngine {
  readonly id: MapEngineId;

  constructor(id: MapEngineId = "google") {
    this.id = id;
  }

  async searchPlaces(_q: PlaceQuery): Promise<PlaceSummary[]> {
    return [];
  }

  async getPlaceDetails(id: string): Promise<PlaceDetails> {
    return {
      enginePlaceId: id,
      name: "Stub place",
      lat: 0,
      lng: 0,
    };
  }

  async reverseGeocode(latLng: LatLng): Promise<Address> {
    return {
      formatted: `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`,
    };
  }
}

export class StubRoutingEngine implements RoutingEngine {
  readonly id: MapEngineId;

  constructor(id: MapEngineId = "google") {
    this.id = id;
  }

  async route(_req: RouteRequest): Promise<RouteResult> {
    return {
      durationSec: 0,
      distanceM: 0,
      transitSteps: [],
    };
  }
}

export class StubCollabPort implements CollabPort {
  async invite(input: CollabInvite): Promise<{ inviteUrl: string }> {
    return { inviteUrl: `https://beaver.plan/invite/stub/${input.tripId}` };
  }

  async pushVersion(
    _tripId: string,
    expectedVersion: number,
  ): Promise<CollabSyncResult> {
    return { ok: true, version: expectedVersion + 1 };
  }
}

export class StubTranslationProvider implements TranslationProvider {
  async translate(req: TranslationRequest): Promise<TranslationResult> {
    return {
      text: `[stub:${req.sourceLocale}→${req.targetLocale}] ${req.text}`,
      provider: "stub",
    };
  }
}

/** Helper: normalize a PlaceSummary into a PlaceRef. */
export function toPlaceRef(
  engine: MapEngineId,
  summary: PlaceSummary,
): PlaceRef {
  return {
    engine,
    enginePlaceId: summary.enginePlaceId,
    name: summary.name,
    address: summary.address,
    lat: summary.lat,
    lng: summary.lng,
  };
}
