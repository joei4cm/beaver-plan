import type { LatLng, Leg, MapEngineId, Stop } from "@beaver/core";

export type BasemapKind = "leaflet" | "google" | "amap" | "baidu";

export type BasemapProps = {
  stops: Stop[];
  legs: Leg[];
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  engineId?: MapEngineId;
};

export type PathLine = {
  id: string;
  mode: string;
  points: LatLng[];
};
