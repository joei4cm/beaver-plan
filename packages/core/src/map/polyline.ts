import type { LatLng } from "../ports.js";

/** Simple lat,lng;lat,lng polyline for demo / cross-engine legs. */
export function encodeSimplePolyline(points: LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
}

export function decodeSimplePolyline(polyline: string): LatLng[] {
  return polyline
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [latS, lngS] = part.split(",");
      return { lat: Number(latS), lng: Number(lngS) };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** Decode Google Encoded Polyline Algorithm Format → LatLng[]. */
export function decodeGoogleEncodedPolyline(encoded: string): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: LatLng[] = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coordinates;
}

/** Convert a Google encoded polyline into our simple format (or undefined). */
export function googleEncodedToSimple(encoded?: string): string | undefined {
  if (!encoded) return undefined;
  const pts = decodeGoogleEncodedPolyline(encoded);
  if (pts.length < 2) return undefined;
  return encodeSimplePolyline(pts);
}

/** Evenly interpolate waypoints between two ends (inclusive). */
export function interpolatePath(
  origin: LatLng,
  destination: LatLng,
  segments = 4,
): LatLng[] {
  const n = Math.max(1, segments);
  const out: LatLng[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({
      lat: origin.lat + (destination.lat - origin.lat) * t,
      lng: origin.lng + (destination.lng - origin.lng) * t,
    });
  }
  return out;
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Point along the great-circle fraction t ∈ [0,1]. */
export function pointAlong(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}
