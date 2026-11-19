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

type GMaps = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Polyline: new (opts: Record<string, unknown>) => GPoly;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  LatLngBounds: new () => GBounds;
  SymbolPath: { CIRCLE: unknown };
};

type GMap = {
  fitBounds: (b: GBounds, padding?: number) => void;
  panTo: (ll: { lat: number; lng: number }) => void;
};
type GPoly = { setMap: (m: GMap | null) => void };
type GMarker = {
  setMap: (m: GMap | null) => void;
  addListener: (ev: string, fn: () => void) => void;
};
type GBounds = { extend: (ll: { lat: number; lng: number }) => void };

declare global {
  interface Window {
    google?: { maps: GMaps };
  }
}

export function GoogleBasemap({
  stops,
  legs,
  selectedStopId,
  onSelectStop,
}: BasemapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const polysRef = useRef<GPoly[]>([]);
  const markersRef = useRef<GMarker[]>([]);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const key = browserMapKeys().google;
    if (!key || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      await loadScript(
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`,
        "bp-google-maps-js",
      );
      if (cancelled || !containerRef.current || !window.google?.maps) return;
      mapRef.current = new window.google.maps.Map(containerRef.current, {
        center: { lat: 35.0116, lng: 135.7681 },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        styles: softGoogleStyles,
      });
      setReady(true);
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      polysRef.current.forEach((p) => p.setMap(null));
      markersRef.current.forEach((m) => m.setMap(null));
      mapRef.current = null;
    };
  }, []);

  const paint = useCallback(() => {
    const g = window.google?.maps;
    const map = mapRef.current;
    if (!g || !map || !ready) return;

    polysRef.current.forEach((p) => p.setMap(null));
    markersRef.current.forEach((m) => m.setMap(null));

    const lines = collectPathLines(stops, legs);
    polysRef.current = lines.map((line) => {
      const style = strokeForMode(line.mode);
      const dashed = Boolean(style.dasharray);
      return new g.Polyline({
        path: line.points,
        map,
        strokeColor: style.color,
        strokeOpacity: dashed ? 0 : style.opacity,
        strokeWeight: style.width,
        icons: dashed
          ? [
              {
                icon: {
                  path: "M 0,-1 0,1",
                  strokeOpacity: style.opacity,
                  strokeColor: style.color,
                  scale: 2,
                },
                offset: "0",
                repeat: "10px",
              },
            ]
          : undefined,
      });
    });

    markersRef.current = stops.map((stop, index) => {
      const selected = stop.id === selectedStopId;
      const marker = new g.Marker({
        map,
        position: { lat: stop.place.lat, lng: stop.place.lng },
        label: {
          text: String(index + 1),
          color: selected ? "#FFFFFF" : "#0F172A",
          fontWeight: "700",
          fontSize: "11px",
        },
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: selected ? 12 : 10,
          fillColor: selected ? "#2F6BFF" : "#FFFFFF",
          fillOpacity: 1,
          strokeColor: "#2F6BFF",
          strokeWeight: 2.5,
        },
      });
      marker.addListener("click", () => onSelectRef.current(stop.id));
      return marker;
    });

    const fitPts = collectFitPoints(stops, lines);
    if (!fittedRef.current && fitPts.length > 0) {
      const bounds = new g.LatLngBounds();
      for (const p of fitPts) bounds.extend(p);
      map.fitBounds(bounds, 56);
      fittedRef.current = true;
    } else if (selectedStopId) {
      const sel = stops.find((s) => s.id === selectedStopId);
      if (sel) map.panTo({ lat: sel.place.lat, lng: sel.place.lng });
    }
  }, [stops, legs, selectedStopId, ready]);

  useEffect(() => {
    paint();
  }, [paint]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}

const softGoogleStyles: Record<string, unknown>[] = [
  { elementType: "geometry", stylers: [{ color: "#f4f6fa" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e6ecf5" }],
  },
  { featureType: "water", stylers: [{ color: "#dbe8ff" }] },
];
