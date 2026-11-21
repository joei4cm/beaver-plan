"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BasemapProps } from "./types";
import { browserMapKeys } from "./resolve-basemap";
import { loadScript } from "./load-script";
import {
  collectFitPoints,
  collectPathLines,
  strokeForMode,
} from "./route-style";
import { MapSkeleton } from "./map-skeleton";

type BMapNS = {
  Map: new (el: string | HTMLElement) => BMapInst;
  Point: new (lng: number, lat: number) => BPoint;
  Polyline: new (pts: BPoint[], opts: Record<string, unknown>) => BOverlay;
  Marker: new (pt: BPoint) => BMarker;
  Label: new (content: string, opts?: Record<string, unknown>) => BLabel;
  Size: new (w: number, h: number) => unknown;
};

type BPoint = { lng: number; lat: number };
type BMapInst = {
  centerAndZoom: (pt: BPoint, zoom: number) => void;
  enableScrollWheelZoom: (on: boolean) => void;
  addOverlay: (o: unknown) => void;
  clearOverlays: () => void;
  setViewport: (pts: BPoint[]) => void;
  panTo: (pt: BPoint) => void;
};
type BOverlay = unknown;
type BMarker = {
  setLabel: (l: BLabel) => void;
  addEventListener: (ev: string, fn: () => void) => void;
};
type BLabel = { setStyle: (s: Record<string, string>) => void };

declare global {
  interface Window {
    BMap?: BMapNS;
  }
}

export function BaiduBasemap({
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
  const mapRef = useRef<BMapInst | null>(null);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const onFailRef = useRef(onEngineFail);
  onFailRef.current = onEngineFail;
  const fittedRef = useRef(false);
  const lastFitNonceRef = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const key = browserMapKeys().baidu;
    if (!key) {
      onFailRef.current?.();
      return;
    }
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      await loadScript(
        `https://api.map.baidu.com/api?v=3.0&ak=${encodeURIComponent(key)}`,
        "bp-baidu-maps-js",
      );
      if (cancelled || !containerRef.current) return;
      if (!window.BMap) {
        onFailRef.current?.();
        return;
      }
      const map = new window.BMap.Map(containerRef.current);
      map.centerAndZoom(new window.BMap.Point(135.7681, 35.0116), 12);
      map.enableScrollWheelZoom(true);
      mapRef.current = map;
      setReady(true);
    })().catch(() => {
      if (!cancelled) onFailRef.current?.();
    });

    return () => {
      cancelled = true;
      mapRef.current = null;
    };
  }, []);

  const paint = useCallback(() => {
    const BMap = window.BMap;
    const map = mapRef.current;
    if (!BMap || !map || !ready) return;

    map.clearOverlays();
    const lines = showRoutes ? collectPathLines(stops, legs) : [];
    for (const line of lines) {
      const style = strokeForMode(line.mode);
      const pts = line.points.map((p) => new BMap.Point(p.lng, p.lat));
      map.addOverlay(
        new BMap.Polyline(pts, {
          strokeColor: style.color,
          strokeWeight: style.width,
          strokeOpacity: style.opacity,
          strokeStyle: style.dasharray ? "dashed" : "solid",
        }),
      );
    }

    if (showStops) {
      stops.forEach((stop, index) => {
        const selected = stop.id === selectedStopId;
        const marker = new BMap.Marker(
          new BMap.Point(stop.place.lng, stop.place.lat),
        );
        const label = new BMap.Label(String(index + 1), {
          offset: new BMap.Size(-8, -8),
        });
        // Lumen depth parity with .bp-map-marker (tokens inlined for Baidu Label).
        label.setStyle({
          border: selected ? "2.5px solid #1a4fd6" : "2.5px solid #2F6BFF",
          borderRadius: "999px",
          width: selected ? "30px" : "22px",
          height: selected ? "30px" : "22px",
          lineHeight: selected ? "25px" : "17px",
          textAlign: "center",
          background: selected ? "#2F6BFF" : "#FFFFFF",
          color: selected ? "#FFFFFF" : "#0F172A",
          fontWeight: "700",
          fontSize: selected ? "12px" : "11px",
          boxShadow: selected
            ? "0 0 0 3px rgba(47,107,255,0.28),0 2px 4px rgba(15,23,42,0.08),0 10px 22px rgba(15,23,42,0.18)"
            : "0 1px 2px rgba(15,23,42,0.08),0 4px 12px rgba(15,23,42,0.18)",
        });
        marker.setLabel(label);
        marker.addEventListener("click", () => onSelectRef.current(stop.id));
        map.addOverlay(marker);
      });
    }

    const fitPts = collectFitPoints(stops, collectPathLines(stops, legs)).map(
      (p) => new BMap.Point(p.lng, p.lat),
    );
    const locateRequested = fitNonce !== lastFitNonceRef.current;
    if (locateRequested) lastFitNonceRef.current = fitNonce;
    if ((!fittedRef.current || locateRequested) && fitPts.length > 0) {
      map.setViewport(fitPts);
      fittedRef.current = true;
    } else if (selectedStopId && showStops) {
      const sel = stops.find((s) => s.id === selectedStopId);
      if (sel) map.panTo(new BMap.Point(sel.place.lng, sel.place.lat));
    }
  }, [stops, legs, selectedStopId, ready, showRoutes, showStops, fitNonce]);

  useEffect(() => {
    paint();
  }, [paint]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {!ready && <MapSkeleton label="Loading Baidu Maps" />}
    </>
  );
}
