import type { LatLng, Leg, MapEngineId, Stop } from "@beaver/core";

export type BasemapKind = "leaflet" | "google" | "amap" | "baidu";

export type BasemapProps = {
  stops: Stop[];
  legs: Leg[];
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  engineId?: MapEngineId;
  /** When false, skip painting route polylines (map chrome layers). */
  showRoutes?: boolean;
  /** When false, skip painting stop markers (map chrome layers). */
  showStops?: boolean;
  /** Increment to re-fit the map to the current day route (locate control). */
  fitNonce?: number;
};

export type PathLine = {
  id: string;
  mode: string;
  points: LatLng[];
};
