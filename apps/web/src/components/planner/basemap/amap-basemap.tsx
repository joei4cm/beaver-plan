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
}: BasemapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapInst | null>(null);
  const overlaysRef = useRef<AMapOverlay[]>([]);
  const markersRef = useRef<AMapMarker[]>([]);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const key = browserMapKeys().amap;
    if (!key || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      await loadScript(
        `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`,
        "bp-amap-maps-js",
      );
      if (cancelled || !containerRef.current || !window.AMap) return;
      mapRef.current = new window.AMap.Map(containerRef.current, {
        zoom: 12,
        center: [135.7681, 35.0116],
        viewMode: "2D",
      });
      setReady(true);
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
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

    const lines = collectPathLines(stops, legs);
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

    markersRef.current = stops.map((stop, index) => {
      const selected = stop.id === selectedStopId;
      const marker = new AMap.Marker({
        position: [stop.place.lng, stop.place.lat],
        content: pinContent(index, selected),
        offset: new AMap.Pixel(selected ? -14 : -11, selected ? -14 : -11),
      });
      marker.on("click", () => onSelectRef.current(stop.id));
      map.add(marker);
      return marker;
    });

    const fitPts = collectFitPoints(stops, lines);
    if (!fittedRef.current && fitPts.length > 0) {
      map.setFitView(
        [...overlaysRef.current, ...markersRef.current],
        false,
        [56, 56, 56, 56],
      );
      fittedRef.current = true;
    } else if (selectedStopId) {
      const sel = stops.find((s) => s.id === selectedStopId);
      if (sel) map.setCenter([sel.place.lng, sel.place.lat]);
    }
  }, [stops, legs, selectedStopId, ready]);

  useEffect(() => {
    paint();
  }, [paint]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}

function pinContent(index: number, selected: boolean): string {
  const size = selected ? 28 : 22;
  const bg = selected ? "#2F6BFF" : "#FFFFFF";
  const fg = selected ? "#FFFFFF" : "#0F172A";
  return `<div style="width:${size}px;height:${size}px;border-radius:999px;border:2.5px solid #2F6BFF;background:${bg};color:${fg};display:grid;place-items:center;font:700 11px/1 sans-serif;box-shadow:0 2px 8px rgba(15,23,42,.16)">${index + 1}</div>`;
}
