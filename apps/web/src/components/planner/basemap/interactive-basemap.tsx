"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { BasemapProps } from "./types";
import {
  basemapProviderLabel,
  resolveBasemapKind,
} from "./resolve-basemap";
import { MapSkeleton } from "./map-skeleton";

export { basemapProviderLabel, resolveBasemapKind };

const LeafletBasemap = dynamic(
  () => import("./leaflet-basemap").then((m) => m.LeafletBasemap),
  { ssr: false, loading: () => <MapSkeleton /> },
);
const GoogleBasemap = dynamic(
  () => import("./google-basemap").then((m) => m.GoogleBasemap),
  { ssr: false, loading: () => <MapSkeleton label="Loading Google Maps" /> },
);
const AmapBasemap = dynamic(
  () => import("./amap-basemap").then((m) => m.AmapBasemap),
  { ssr: false, loading: () => <MapSkeleton label="Loading Amap" /> },
);
const BaiduBasemap = dynamic(
  () => import("./baidu-basemap").then((m) => m.BaiduBasemap),
  { ssr: false, loading: () => <MapSkeleton label="Loading Baidu Maps" /> },
);

/**
 * Pluggable interactive basemap:
 * prefer Google / Amap / Baidu JS when a matching browser key exists;
 * otherwise Leaflet + OSM daylight raster tiles (Esri soft-fail; no key, no WebGL)
 * so demos never look like an empty grid.
 *
 * Each vendor chunk loads only when that kind is selected — keeps the OSM demo path lean.
 */
export function InteractiveBasemap(props: BasemapProps) {
  const kind = useMemo(
    () => resolveBasemapKind(props.engineId),
    [props.engineId],
  );

  if (kind === "google") return <GoogleBasemap {...props} />;
  if (kind === "amap") return <AmapBasemap {...props} />;
  if (kind === "baidu") return <BaiduBasemap {...props} />;
  return <LeafletBasemap {...props} />;
}
