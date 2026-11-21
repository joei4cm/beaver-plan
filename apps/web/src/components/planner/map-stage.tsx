"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Leg, MapEngineId, PlaceSummary, Stop } from "@beaver/core";
import { legPathSegments } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import {
  basemapProviderLabel,
  resolveBasemapKind,
} from "./basemap/resolve-basemap";
import { MapSkeleton } from "./basemap/map-skeleton";
import { MapChrome, type MapLayerFlags } from "./map-chrome";

const InteractiveBasemap = dynamic(
  () =>
    import("./basemap/interactive-basemap").then((m) => m.InteractiveBasemap),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  },
);

const DEFAULT_LAYERS: MapLayerFlags = {
  routes: true,
  stops: true,
  legend: true,
};

type Props = {
  stops: Stop[];
  legs: Leg[];
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  engineLabel: string;
  modeLabel: string;
  engineId?: MapEngineId;
  mode?: "live" | "demo";
  locale?: Locale;
  query: string;
  results: PlaceSummary[];
  searching: boolean;
  onQueryChange: (value: string) => void;
  onSearchCommit: (value: string) => void;
  onPickPlace: (place: PlaceSummary) => void;
};

export function MapStage({
  stops,
  legs,
  selectedStopId,
  onSelectStop,
  engineLabel,
  modeLabel,
  engineId,
  mode = "demo",
  locale = "zh-CN",
  query,
  results,
  searching,
  onQueryChange,
  onSearchCommit,
  onPickPlace,
}: Props) {
  const basemapKind = resolveBasemapKind(engineId);
  const tileLabel = basemapProviderLabel(basemapKind);
  // Soft-fail when Directions/Places are demo *or* vendor JS map keys are absent (Leaflet fallback).
  const softFail = mode !== "live" || basemapKind === "leaflet";
  const [layers, setLayers] = useState<MapLayerFlags>(DEFAULT_LAYERS);
  const [fitNonce, setFitNonce] = useState(0);
  const [locateNotice, setLocateNotice] = useState<string | null>(null);

  const hasRoute =
    stops.length > 0 || legs.some((l) => legPathSegments(l).length > 0);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden bg-[#EAF0F8] lg:min-h-[640px] lg:rounded-none">
      <InteractiveBasemap
        stops={stops}
        legs={legs}
        selectedStopId={selectedStopId}
        onSelectStop={onSelectStop}
        engineId={engineId}
        showRoutes={layers.routes}
        showStops={layers.stops}
        fitNonce={fitNonce}
      />

      <MapChrome
        locale={locale}
        engineLabel={engineLabel}
        modeLabel={modeLabel}
        tileLabel={tileLabel}
        softFail={softFail}
        softFailMessage={locateNotice}
        query={query}
        results={results}
        searching={searching}
        onQueryChange={onQueryChange}
        onSearchCommit={onSearchCommit}
        onPickPlace={onPickPlace}
        layers={layers}
        onLayersChange={setLayers}
        onLocate={() => {
          setLocateNotice(null);
          setFitNonce((n) => n + 1);
        }}
        onLocateSoftFail={setLocateNotice}
        hasRoute={hasRoute}
      />
    </div>
  );
}
