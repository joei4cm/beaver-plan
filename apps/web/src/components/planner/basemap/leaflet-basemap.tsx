"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup, Renderer } from "leaflet";
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
import { armLeafletRouteDraw, routeDrawSignature } from "./route-draw";
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
 * - Route polylines: SVG renderer + tip-011 ease draw-in (azure / mode stroke).
 */
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Tiles &copy; Esri";

/** Stagger between segment draw-ins (tip-011 entrance cadence). */
const ROUTE_DRAW_STAGGER_MS = 110;

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
  const routesLayerRef = useRef<LayerGroup | null>(null);
  const markersLayerRef = useRef<LayerGroup | null>(null);
  const routeRendererRef = useRef<Renderer | null>(null);
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
  const lastRouteSigRef = useRef<string>("");
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
        // Canvas tiles stay fine; route vectors use a dedicated SVG renderer
        // so tip-011 stroke-dash draw-in works (canvas cannot CSS-animate paths).
        preferCanvas: true,
        fadeAnimation: false,
        zoomAnimation: true,
        markerZoomAnimation: false,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Dedicated SVG pane for azure road polylines (draw-in + mode dashes).
      const routeRenderer = L.svg({ padding: 0.5 });
      routeRenderer.addTo(map);
      routeRendererRef.current = routeRenderer;

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

      routesLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
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
      routesLayerRef.current = null;
      markersLayerRef.current = null;
      routeRendererRef.current = null;
      LRef.current = null;
      fittedRef.current = false;
      lastStopCountRef.current = 0;
      markersPaintedRef.current = false;
      prevSelectedRef.current = null;
      lastRouteSigRef.current = "";
    };
  }, []);

  // Routes: road-following polylines + tip-011 draw-in (only when geometry changes).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const routes = routesLayerRef.current;
    const renderer = routeRendererRef.current;
    if (!L || !map || !routes || !engineReady) return;

    const lines = showRoutes ? collectPathLines(stops, legs) : [];
    const sig = showRoutes ? routeDrawSignature(lines) : "";
    const routesChanged = sig !== lastRouteSigRef.current;

    if (routesChanged) {
      routes.clearLayers();
      lastRouteSigRef.current = sig;

      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      lines.forEach((line, index) => {
        const style = strokeForMode(line.mode);
        const latlngs = line.points.map((p) => L.latLng(p.lat, p.lng));
        const modeDash = style.dasharray
          ? style.dasharray.map((n) => n * 4).join(" ")
          : undefined;
        const delayMs = index * ROUTE_DRAW_STAGGER_MS;

        const halo = L.polyline(latlngs, {
          color: "#FFFFFF",
          weight: style.width + 3,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
          renderer: renderer ?? undefined,
          className: "bp-route-polyline bp-route-polyline--halo",
        }).addTo(routes);

        const stroke = L.polyline(latlngs, {
          color: style.color,
          weight: style.width,
          opacity: style.opacity,
          dashArray: reduceMotion ? modeDash : undefined,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
          renderer: renderer ?? undefined,
          className: "bp-route-polyline bp-route-polyline--stroke",
        }).addTo(routes);

        if (!reduceMotion) {
          // Halo draws slightly ahead; azure stroke follows with tip-011 ease-out.
          requestAnimationFrame(() => {
            armLeafletRouteDraw(halo.getElement() as SVGPathElement | null, {
              delayMs,
            });
            armLeafletRouteDraw(stroke.getElement() as SVGPathElement | null, {
              delayMs: delayMs + 40,
              restoreDash: modeDash,
            });
          });
        }
      });
    }

    const fitPts = collectFitPoints(stops, lines).map((p) =>
      L.latLng(p.lat, p.lng),
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
    }
  }, [stops, legs, engineReady, showRoutes, fitNonce]);

  // Markers: tip-011 overshoot pop — independent of route draw so select stays calm.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const markers = markersLayerRef.current;
    if (!L || !map || !markers || !engineReady) return;

    const paint = () => {
      markers.clearLayers();

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
          marker.addTo(markers);
        });
        markersPaintedRef.current = true;
      }

      prevSelectedRef.current = selectedStopId;

      // Pan to selection only when routes did not just re-fit.
      if (selectedStopId && showStops && selectionChanged) {
        const sel = stops.find((s) => s.id === selectedStopId);
        if (sel) map.panTo([sel.place.lat, sel.place.lng]);
      }
    };

    const id = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(id);
  }, [stops, selectedStopId, engineReady, showStops]);

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
