"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { BasemapProps } from "./types";
import {
  collectFitPoints,
  collectPathLines,
  MARKER_ICON_ANCHOR,
  MARKER_ICON_SIZE,
  markerHtml,
  strokeForMode,
} from "./route-style";
import { MapSkeleton } from "./map-skeleton";

/**
 * Free raster basemap — no vendor browser key, no WebGL.
 * Primary: OSM standard. Soft-fail fallback: Esri World Street Map.
 *
 * Perf notes:
 * - Leaflet JS/CSS load only inside this effect (code-split from planner shell).
 * - Fit bounds *before* attaching tiles so the first tile request matches the route.
 * - Skeleton stays until the first tile layer `load` (or soft-fail swap).
 * - Stop markers: tip-011 overshoot pop on select; fixed DivIcon footprint.
 */
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Tiles &copy; Esri";

type LeafletNS = typeof import("leaflet");

export function LeafletBasemap({
  stops,
  legs,
  selectedStopId,
  onSelectStop,
  showRoutes = true,
  showStops = true,
  fitNonce = 0,
}: BasemapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const LRef = useRef<LeafletNS | null>(null);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const stopsRef = useRef(stops);
  const legsRef = useRef(legs);
  stopsRef.current = stops;
  legsRef.current = legs;
  const fittedRef = useRef(false);
  const lastStopCountRef = useRef(0);
  const lastFitNonceRef = useRef(0);
  const prevSelectedRef = useRef<string | null>(null);
  const markersPaintedRef = useRef(false);
  const [engineReady, setEngineReady] = useState(false);
  const [tilesReady, setTilesReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let sizeTimer = 0;
    let tilesTimer = 0;
    let map: LeafletMap | null = null;

    (async () => {
      // Yield so itinerary chrome can paint before Leaflet parses/inits.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled || !containerRef.current) return;

      // Dynamic import keeps leaflet JS off the planner shell critical path.
      const leafletMod = await import("leaflet");
      const L = leafletMod.default;
      if (cancelled || !containerRef.current) return;
      LRef.current = L;

      map = L.map(containerRef.current, {
        // Bottom-right so floating map chrome (top) stays clear.
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: true,
        preferCanvas: true,
        // Skip fade so first tiles feel snappier on soft paper.
        fadeAnimation: false,
        zoomAnimation: true,
        markerZoomAnimation: false,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Fit route extent *before* requesting tiles (avoids Kyoto default → re-zoom double fetch).
      const lines = collectPathLines(stopsRef.current, legsRef.current);
      const fitPts = collectFitPoints(stopsRef.current, lines).map((p) =>
        L.latLng(p.lat, p.lng),
      );
      if (fitPts.length > 0) {
        map.fitBounds(L.latLngBounds(fitPts), {
          padding: [48, 48],
          maxZoom: 14,
          animate: false,
        });
        fittedRef.current = true;
        lastStopCountRef.current = stopsRef.current.length;
      } else {
        map.setView([35.0116, 135.7681], 12);
      }

      const tileOpts = {
        maxZoom: 19,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 2,
        crossOrigin: true as const,
      };

      const osm = L.tileLayer(OSM_URL, {
        ...tileOpts,
        attribution: OSM_ATTR,
        className: "bp-osm-tiles",
      });
      const esri = L.tileLayer(ESRI_URL, {
        ...tileOpts,
        attribution: ESRI_ATTR,
      });

      let softFailed = false;
      let tileErrors = 0;
      const markTilesReady = () => {
        if (!cancelled) setTilesReady(true);
      };
      osm.on("load", markTilesReady);
      esri.on("load", markTilesReady);
      osm.on("tileerror", () => {
        tileErrors += 1;
        // Soft-fail after a couple of misses so one flaky tile does not thrash.
        if (!softFailed && tileErrors >= 2 && map && map.hasLayer(osm)) {
          softFailed = true;
          map.removeLayer(osm);
          esri.addTo(map);
        }
      });
      osm.addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setEngineReady(true);

      // Never leave the skeleton forever if tile CDN stalls.
      tilesTimer = window.setTimeout(markTilesReady, 4000);
      sizeTimer = window.setTimeout(() => map?.invalidateSize(), 80);
    })().catch(() => {
      // Soft-fail: map API / Leaflet chunk absent — drop skeleton, keep paper stage.
      if (!cancelled) {
        setTilesReady(true);
        setLoadFailed(true);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(sizeTimer);
      window.clearTimeout(tilesTimer);
      map?.remove();
      mapRef.current = null;
      layerRef.current = null;
      LRef.current = null;
      fittedRef.current = false;
      lastStopCountRef.current = 0;
      markersPaintedRef.current = false;
      prevSelectedRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layerRef.current;
    if (!L || !map || !group || !engineReady) return;

    const paint = () => {
      group.clearLayers();
      const lines = showRoutes ? collectPathLines(stops, legs) : [];

      for (const line of lines) {
        const style = strokeForMode(line.mode);
        const latlngs = line.points.map((p) => L.latLng(p.lat, p.lng));
        L.polyline(latlngs, {
          color: "#FFFFFF",
          weight: style.width + 3,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(group);
        L.polyline(latlngs, {
          color: style.color,
          weight: style.width,
          opacity: style.opacity,
          dashArray: style.dasharray
            ? style.dasharray.map((n) => n * 4).join(" ")
            : undefined,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(group);
      }

      const selectionChanged =
        selectedStopId !== null && selectedStopId !== prevSelectedRef.current;
      const firstPaint = !markersPaintedRef.current;

      if (showStops) {
        stops.forEach((stop, index) => {
          // Skip pins without usable coordinates (soft-fail geometry).
          if (
            !Number.isFinite(stop.place.lat) ||
            !Number.isFinite(stop.place.lng)
          ) {
            return;
          }
          const selected = stop.id === selectedStopId;
          const pop =
            selected && (selectionChanged || (firstPaint && selected));
          const icon = L.divIcon({
            className: selected
              ? "bp-leaflet-marker bp-leaflet-marker--active"
              : "bp-leaflet-marker",
            html: markerHtml(index, selected, { pop }),
            iconSize: [MARKER_ICON_SIZE, MARKER_ICON_SIZE],
            iconAnchor: [MARKER_ICON_ANCHOR, MARKER_ICON_ANCHOR],
          });
          const marker = L.marker([stop.place.lat, stop.place.lng], {
            icon,
            zIndexOffset: selected ? 1000 : index,
            riseOnHover: true,
          });
          marker.on("click", () => onSelectRef.current(stop.id));
          marker.addTo(group);
        });
        markersPaintedRef.current = true;
      }

      prevSelectedRef.current = selectedStopId;

      const fitPts = collectFitPoints(stops, collectPathLines(stops, legs)).map(
        (p) => L.latLng(p.lat, p.lng),
      );
      const stopCountChanged = stops.length !== lastStopCountRef.current;
      lastStopCountRef.current = stops.length;
      const locateRequested = fitNonce !== lastFitNonceRef.current;
      if (locateRequested) lastFitNonceRef.current = fitNonce;
      const shouldFit =
        fitPts.length > 0 &&
        (!fittedRef.current || stopCountChanged || locateRequested);
      if (shouldFit) {
        map.fitBounds(L.latLngBounds(fitPts), {
          padding: [56, 56],
          maxZoom: 14,
        });
        fittedRef.current = true;
        window.setTimeout(() => map.invalidateSize(), 50);
      } else if (selectedStopId && showStops) {
        const sel = stops.find((s) => s.id === selectedStopId);
        if (sel) map.panTo([sel.place.lat, sel.place.lng]);
      }
    };

    // Defer overlay paint one frame so tile decode stays ahead of markers.
    const id = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(id);
  }, [
    stops,
    legs,
    selectedStopId,
    engineReady,
    showRoutes,
    showStops,
    fitNonce,
  ]);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 h-full w-full [&_.leaflet-control-attribution]:text-[10px] [&_.bp-osm-tiles]:brightness-[1.02] [&_.bp-osm-tiles]:saturate-[0.85] [&_.bp-osm-tiles]:contrast-[0.96]"
        data-map-soft-fail={loadFailed ? "true" : undefined}
        aria-hidden={loadFailed || undefined}
      />
      {!tilesReady && <MapSkeleton label="Loading tiles" />}
    </>
  );
}
