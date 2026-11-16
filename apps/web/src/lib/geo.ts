import type { LatLng } from "@beaver/core";
import { decodeSimplePolyline } from "@beaver/core";

export type Point = { x: number; y: number };

export function boundsOf(points: LatLng[], pad = 0.02) {
  if (points.length === 0) {
    return { minLat: 34.9, maxLat: 35.1, minLng: 135.6, maxLng: 135.85 };
  }
  let minLat = points[0]!.lat;
  let maxLat = points[0]!.lat;
  let minLng = points[0]!.lng;
  let maxLng = points[0]!.lng;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const latPad = Math.max((maxLat - minLat) * 0.2, pad);
  const lngPad = Math.max((maxLng - minLng) * 0.2, pad);
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

export function project(
  latLng: LatLng,
  bounds: ReturnType<typeof boundsOf>,
  width: number,
  height: number,
): Point {
  const x =
    ((latLng.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) *
    width;
  const y =
    (1 - (latLng.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) *
    height;
  return { x, y };
}

export function polylineToPoints(
  polyline: string | undefined,
  bounds: ReturnType<typeof boundsOf>,
  width: number,
  height: number,
): Point[] {
  if (!polyline) return [];
  // Google encoded polylines don't contain ';' — treat those as opaque and skip decode.
  if (!polyline.includes(",") || (!polyline.includes(";") && !/^-?\d/.test(polyline))) {
    return [];
  }
  try {
    return decodeSimplePolyline(polyline).map((p) =>
      project(p, bounds, width, height),
    );
  } catch {
    return [];
  }
}
