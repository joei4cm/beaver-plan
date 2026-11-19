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
}: BasemapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<BMapInst | null>(null);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const key = browserMapKeys().baidu;
    if (!key || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      await loadScript(
        `https://api.map.baidu.com/api?v=3.0&ak=${encodeURIComponent(key)}`,
        "bp-baidu-maps-js",
      );
      if (cancelled || !containerRef.current || !window.BMap) return;
      const map = new window.BMap.Map(containerRef.current);
      map.centerAndZoom(new window.BMap.Point(135.7681, 35.0116), 12);
      map.enableScrollWheelZoom(true);
      mapRef.current = map;
      setReady(true);
    })().catch(() => undefined);

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
    const lines = collectPathLines(stops, legs);
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

    stops.forEach((stop, index) => {
      const selected = stop.id === selectedStopId;
      const marker = new BMap.Marker(
        new BMap.Point(stop.place.lng, stop.place.lat),
      );
      const label = new BMap.Label(String(index + 1), {
        offset: new BMap.Size(-8, -8),
      });
      label.setStyle({
        border: "2.5px solid #2F6BFF",
        borderRadius: "999px",
        width: selected ? "28px" : "22px",
        height: selected ? "28px" : "22px",
        lineHeight: selected ? "23px" : "17px",
        textAlign: "center",
        background: selected ? "#2F6BFF" : "#FFFFFF",
        color: selected ? "#FFFFFF" : "#0F172A",
        fontWeight: "700",
        fontSize: "11px",
      });
      marker.setLabel(label);
      marker.addEventListener("click", () => onSelectRef.current(stop.id));
      map.addOverlay(marker);
    });

    const fitPts = collectFitPoints(stops, lines).map(
      (p) => new BMap.Point(p.lng, p.lat),
    );
    if (!fittedRef.current && fitPts.length > 0) {
      map.setViewport(fitPts);
      fittedRef.current = true;
    } else if (selectedStopId) {
      const sel = stops.find((s) => s.id === selectedStopId);
      if (sel) map.panTo(new BMap.Point(sel.place.lng, sel.place.lat));
    }
  }, [stops, legs, selectedStopId, ready]);

  useEffect(() => {
    paint();
  }, [paint]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}
