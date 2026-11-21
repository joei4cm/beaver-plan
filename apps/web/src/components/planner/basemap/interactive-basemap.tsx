"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
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
 * Soft-fail: if a vendor JS chunk/API fails to load, fall back to Leaflet.
 * Each vendor chunk loads only when that kind is selected — keeps the OSM demo path lean.
 */
export function InteractiveBasemap({
  onBasemapSoftFail,
  ...props
}: BasemapProps) {
  const preferred = useMemo(
    () => resolveBasemapKind(props.engineId),
    [props.engineId],
  );
  const [softFailVendor, setSoftFailVendor] = useState(false);
  const notifiedRef = useRef(false);
  const onSoftFailProp = useRef(onBasemapSoftFail);
  onSoftFailProp.current = onBasemapSoftFail;

  const onVendorFail = useCallback(() => {
    setSoftFailVendor(true);
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      onSoftFailProp.current?.();
    }
  }, []);

  const kind =
    softFailVendor || preferred === "leaflet" ? "leaflet" : preferred;

  if (kind === "google") {
    return <GoogleBasemap {...props} onEngineFail={onVendorFail} />;
  }
  if (kind === "amap") {
    return <AmapBasemap {...props} onEngineFail={onVendorFail} />;
  }
  if (kind === "baidu") {
    return <BaiduBasemap {...props} onEngineFail={onVendorFail} />;
  }
  return <LeafletBasemap {...props} />;
}
