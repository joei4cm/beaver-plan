import type { MapEngineId } from "@beaver/core";
import type { BasemapKind } from "./types";

function publicKey(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

/** Browser map keys — never server Directions/Places secrets. */
export function browserMapKeys() {
  return {
    google: publicKey("NEXT_PUBLIC_GOOGLE_MAPS_JS_KEY"),
    amap: publicKey("NEXT_PUBLIC_AMAP_JS_KEY"),
    baidu: publicKey("NEXT_PUBLIC_BAIDU_MAP_JS_KEY"),
  };
}

/**
 * Prefer the vendor JS SDK matching the resolved MapEngine when a browser
 * key exists; otherwise Leaflet + OSM tiles (Esri fallback) so demos never look empty.
 */
export function resolveBasemapKind(engineId?: MapEngineId): BasemapKind {
  const keys = browserMapKeys();
  if (engineId === "amap" && keys.amap) return "amap";
  if (engineId === "baidu" && keys.baidu) return "baidu";
  if (engineId === "google" && keys.google) return "google";
  // Soft preference: if only one vendor key is present, use it.
  if (keys.google && !keys.amap && !keys.baidu) return "google";
  if (keys.amap && !keys.google && !keys.baidu) return "amap";
  if (keys.baidu && !keys.google && !keys.amap) return "baidu";
  return "leaflet";
}

export function basemapProviderLabel(kind: BasemapKind): string {
  switch (kind) {
    case "google":
      return "Google Maps";
    case "amap":
      return "Amap";
    case "baidu":
      return "Baidu Maps";
    default:
      return "OpenStreetMap";
  }
}
