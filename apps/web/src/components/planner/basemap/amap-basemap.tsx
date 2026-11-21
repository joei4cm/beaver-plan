"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BasemapProps } from "./types";
import { browserMapKeys } from "./resolve-basemap";
import { loadScript } from "./load-script";
import {
  collectFitPoints,
  collectPathLines,
  markerHtml,
  strokeForMode,
} from "./route-style";
import { MapSkeleton } from "./map-skeleton";

type AMapNS = {
  Map: new (el: string | HTMLElement, opts: Record<string, unknown>) => AMapInst;
  Polyline: new (opts: Record<string, unknown>) => AMapOverlay;
  Marker: new (opts: Record<string, unknown>) => AMapMarker;
  Pixel: new (x: number, y: number) => unknown;
  Icon: new (opts: Record<string, unknown>) => unknown;
  Size: new (w: number, h: number) => unknown;
};

type AMapInst = {
  add: (x: unknown) => void;
  remove: (x: unknown[]) => void;
  setFitView: (overlays?: unknown[], immediate?: boolean, padding?: number[]) => void;
  setCenter: (ll: [number, number]) => void;
  destroy: () => void;
};
type AMapOverlay = { setMap: (m: AMapInst | null) => void };
type AMapMarker = {
  setMap: (m: AMapInst | null) => void;
  on: (ev: string, fn: () => void) => void;
  setContent: (html: string) => void;
};

declare global {
  interface Window {
    AMap?: AMapNS;
  }
}

export function AmapBasemap({
  stops,
  legs,
  selectedStopId,
  onSelectStop,
  showRoutes = true,
  showStops = true,
  fitNonce = 0,
  onEngineFail,
}: BasemapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapInst | null>(null);
  const overlaysRef = useRef<AMapOverlay[]>([]);
  const markersRef = useRef<AMapMarker[]>([]);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const onFailRef = useRef(onEngineFail);
  onFailRef.current = onEngineFail;
  const fittedRef = useRef(false);
  const lastFitNonceRef = useRef(0);
  const prevSelectedRef = useRef<string | null>(null);
  const markersPaintedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const key = browserMapKeys().amap;
    if (!key) {
      onFailRef.current?.();
      return;
    }
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      await loadScript(
        `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`,
        "bp-amap-maps-js",
      );
      if (cancelled || !containerRef.current) return;
      if (!window.AMap) {
        onFailRef.current?.();
        return;
      }
      mapRef.current = new window.AMap.Map(containerRef.current, {
        zoom: 12,
        center: [135.7681, 35.0116],
        viewMode: "2D",
      });
      setReady(true);
    })().catch(() => {
      if (!cancelled) onFailRef.current?.();
    });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      markersPaintedRef.current = false;
      prevSelectedRef.current = null;
    };
  }, []);

  const paint = useCallback(() => {
    const AMap = window.AMap;
    const map = mapRef.current;
    if (!AMap || !map || !ready) return;

    if (overlaysRef.current.length) map.remove(overlaysRef.current);
    if (markersRef.current.length) map.remove(markersRef.current);
    overlaysRef.current = [];
    markersRef.current = [];

    const lines = showRoutes ? collectPathLines(stops, legs) : [];
    overlaysRef.current = lines.map((line) => {
      const style = strokeForMode(line.mode);
      const poly = new AMap.Polyline({
        path: line.points.map((p) => [p.lng, p.lat]),
        strokeColor: style.color,
        strokeWeight: style.width,
        strokeOpacity: style.opacity,
        strokeStyle: style.dasharray ? "dashed" : "solid",
        lineJoin: "round",
        lineCap: "round",
      });
      map.add(poly);
      return poly;
    });

    const selectionChanged =
      selectedStopId !== null && selectedStopId !== prevSelectedRef.current;
    const firstPaint = !markersPaintedRef.current;

    markersRef.current = showStops
      ? stops.map((stop, index) => {
          const selected = stop.id === selectedStopId;
          // Tip-011 pop only for newly selected / first selected paint.
          const pop =
            selected && (selectionChanged || (firstPaint && selected));
          const marker = new AMap.Marker({
            position: [stop.place.lng, stop.place.lat],
            content: markerHtml(index, selected, {
              centerWithTransform: true,
              pop,
            }),
            // Shell is 48×48 and CSS-centered; keep AMap offset at origin.
            offset: new AMap.Pixel(0, 0),
          });
          marker.on("click", () => onSelectRef.current(stop.id));
          map.add(marker);
          return marker;
        })
      : [];

    if (showStops) markersPaintedRef.current = true;
    prevSelectedRef.current = selectedStopId;

    const fitPts = collectFitPoints(stops, collectPathLines(stops, legs));
    const locateRequested = fitNonce !== lastFitNonceRef.current;
    if (locateRequested) lastFitNonceRef.current = fitNonce;
    if ((!fittedRef.current || locateRequested) && fitPts.length > 0) {
      map.setFitView(
        [...overlaysRef.current, ...markersRef.current],
        false,
        [56, 56, 56, 56],
      );
      fittedRef.current = true;
    } else if (selectedStopId && showStops && selectionChanged) {
      const sel = stops.find((s) => s.id === selectedStopId);
      if (sel) map.setCenter([sel.place.lng, sel.place.lat]);
    }
  }, [stops, legs, selectedStopId, ready, showRoutes, showStops, fitNonce]);

  useEffect(() => {
    paint();
  }, [paint]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {!ready && <MapSkeleton label="Loading Amap" />}
    </>
  );
}

