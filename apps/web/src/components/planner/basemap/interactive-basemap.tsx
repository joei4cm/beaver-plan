"use client";

import { useMemo } from "react";
import type { BasemapProps } from "./types";
import {
  basemapProviderLabel,
  resolveBasemapKind,
} from "./resolve-basemap";
import { LeafletBasemap } from "./leaflet-basemap";
import { GoogleBasemap } from "./google-basemap";
import { AmapBasemap } from "./amap-basemap";
import { BaiduBasemap } from "./baidu-basemap";

export { basemapProviderLabel, resolveBasemapKind };

/**
 * Pluggable interactive basemap:
 * prefer Google / Amap / Baidu JS when a matching browser key exists;
 * otherwise Leaflet + OSM daylight raster tiles (Esri fallback; no key, no WebGL)
 * so demos never look like an empty grid.
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
