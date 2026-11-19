"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { BasemapProps } from "./types";
import {
  collectFitPoints,
  collectPathLines,
  markerHtml,
  strokeForMode,
} from "./route-style";

/**
 * Free raster basemap — no vendor browser key, no WebGL.
 * Primary: OSM standard. Fallback layer: Esri World Street Map.
 */
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Tiles &copy; Esri";

export function LeafletBasemap({
  stops,
  legs,
  selectedStopId,
  onSelectStop,
}: BasemapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const fittedRef = useRef(false);
  const lastStopCountRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    }).setView([35.0116, 135.7681], 12);

    const osm = L.tileLayer(OSM_URL, {
      attribution: OSM_ATTR,
      maxZoom: 19,
      // Soften OSM’s default contrast toward Lumen Route paper.
      className: "bp-osm-tiles",
    });
    const esri = L.tileLayer(ESRI_URL, {
      attribution: ESRI_ATTR,
      maxZoom: 19,
    });
    osm.on("tileerror", () => {
      if (map.hasLayer(osm)) {
        map.removeLayer(osm);
        esri.addTo(map);
      }
    });
    osm.addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet needs a invalidateSize after flex layout settles.
    const t = window.setTimeout(() => map.invalidateSize(), 80);

    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fittedRef.current = false;
      lastStopCountRef.current = 0;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const lines = collectPathLines(stops, legs);

    for (const line of lines) {
      const style = strokeForMode(line.mode);
      const latlngs = line.points.map((p) => L.latLng(p.lat, p.lng));
      // White casing so routes read on light tiles
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

    stops.forEach((stop, index) => {
      const selected = stop.id === selectedStopId;
      const icon = L.divIcon({
        className: "bp-leaflet-marker",
        html: markerHtml(index, selected),
        iconSize: [selected ? 28 : 22, selected ? 28 : 22],
        iconAnchor: [selected ? 14 : 11, selected ? 14 : 11],
      });
      const marker = L.marker([stop.place.lat, stop.place.lng], { icon });
      marker.on("click", () => onSelectRef.current(stop.id));
      marker.addTo(group);
    });

    const fitPts = collectFitPoints(stops, lines).map((p) =>
      L.latLng(p.lat, p.lng),
    );
    const stopCountChanged = stops.length !== lastStopCountRef.current;
    lastStopCountRef.current = stops.length;
    const shouldFit =
      fitPts.length > 0 && (!fittedRef.current || stopCountChanged);
    if (shouldFit) {
      map.fitBounds(L.latLngBounds(fitPts), { padding: [48, 48], maxZoom: 14 });
      fittedRef.current = true;
      window.setTimeout(() => map.invalidateSize(), 50);
    } else if (selectedStopId) {
      const sel = stops.find((s) => s.id === selectedStopId);
      if (sel) map.panTo([sel.place.lat, sel.place.lng]);
    }
  }, [stops, legs, selectedStopId]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 h-full w-full [&_.leaflet-control-attribution]:text-[10px] [&_.bp-leaflet-marker]:border-0 [&_.bp-leaflet-marker]:bg-transparent [&_.bp-osm-tiles]:brightness-[1.02] [&_.bp-osm-tiles]:saturate-[0.85] [&_.bp-osm-tiles]:contrast-[0.96]"
    />
  );
}
