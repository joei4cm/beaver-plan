import type { LatLng } from "../ports.js";
import { encodeSimplePolyline, haversineM, pointAlong } from "./polyline.js";

/**
 * Demo / fixture road geometry — street-grid elbows + Kyoto corridor waypoints.
 * Live MapEngine routes (Google / Amap / Baidu) already return vendor polylines;
 * this module only feeds DemoRoutingEngine + sample-kyoto when keys are absent.
 */

/** Densify a polyline with even samples between vertices (no new elbows). */
export function densifyPath(points: LatLng[], perSegment = 3): LatLng[] {
  if (points.length < 2) return points.slice();
  const n = Math.max(1, perSegment);
  const out: LatLng[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    for (let s = 0; s < n; s++) {
      const t = s / n;
      out.push(pointAlong(a, b, t));
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

/**
 * Street-grid style path: follow the longer axis first, then turn toward the
 * destination, with small mid-block jogs so the map never draws a chord.
 */
export function roadFollowPath(
  origin: LatLng,
  destination: LatLng,
  opts?: { mode?: "walk" | "drive" | "transit"; samples?: number },
): LatLng[] {
  const dLat = destination.lat - origin.lat;
  const dLng = destination.lng - origin.lng;
  const absLat = Math.abs(dLat);
  const absLng = Math.abs(dLng);
  const distanceM = haversineM(origin, destination);

  // Tiny hops: still bend once so SVG never collapses to a straight line.
  if (distanceM < 120) {
    const jog = {
      lat: origin.lat + dLat * 0.5 + (absLng > 0 ? Math.sign(dLng) * 0.00012 : 0.00015),
      lng: origin.lng + dLng * 0.5 + (absLat > 0 ? Math.sign(dLat) * 0.00012 : -0.00015),
    };
    return densifyPath([origin, jog, destination], 2);
  }

  const lngFirst = absLng >= absLat;
  // Perpendicular offset scales with span so the jog reads as a block turn.
  const jogLat = Math.max(0.00035, absLng * 0.12) * (dLng >= 0 ? 1 : -1);
  const jogLng = Math.max(0.00035, absLat * 0.12) * (dLat >= 0 ? 1 : -1);

  let skeleton: LatLng[];
  if (lngFirst) {
    const turn1 = {
      lat: origin.lat + Math.sign(dLat || 1) * Math.min(absLat * 0.08, 0.0012) + jogLat * 0.15,
      lng: origin.lng + dLng * 0.28,
    };
    const corner = {
      lat: origin.lat + dLat * 0.18 + jogLat * 0.35,
      lng: origin.lng + dLng * 0.72,
    };
    const turn2 = {
      lat: origin.lat + dLat * 0.62,
      lng: destination.lng - Math.sign(dLng || 1) * Math.min(absLng * 0.06, 0.0009),
    };
    const approach = {
      lat: destination.lat - Math.sign(dLat || 1) * Math.min(absLat * 0.1, 0.0008),
      lng: destination.lng,
    };
    skeleton = [origin, turn1, corner, turn2, approach, destination];
  } else {
    const turn1 = {
      lat: origin.lat + dLat * 0.28,
      lng: origin.lng + Math.sign(dLng || 1) * Math.min(absLng * 0.08, 0.0012) + jogLng * 0.15,
    };
    const corner = {
      lat: origin.lat + dLat * 0.72,
      lng: origin.lng + dLng * 0.18 + jogLng * 0.35,
    };
    const turn2 = {
      lat: destination.lat - Math.sign(dLat || 1) * Math.min(absLat * 0.06, 0.0009),
      lng: origin.lng + dLng * 0.62,
    };
    const approach = {
      lat: destination.lat,
      lng: destination.lng - Math.sign(dLng || 1) * Math.min(absLng * 0.1, 0.0008),
    };
    skeleton = [origin, turn1, corner, turn2, approach, destination];
  }

  // Walks get denser vertices; drive/transit keep smoother arterials.
  const samples =
    opts?.samples ??
    (opts?.mode === "walk" ? 4 : opts?.mode === "drive" ? 3 : 3);
  return densifyPath(skeleton, samples);
}

/** Encode a road-following simple polyline between two points. */
export function encodeRoadPolyline(
  origin: LatLng,
  destination: LatLng,
  opts?: { mode?: "walk" | "drive" | "transit"; samples?: number },
): string {
  return encodeSimplePolyline(roadFollowPath(origin, destination, opts));
}

/**
 * Warp a fixture corridor so the first/last vertices snap to the real
 * origin/destination while intermediate shape is preserved.
 */
export function snapCorridor(
  corridor: LatLng[],
  origin: LatLng,
  destination: LatLng,
): LatLng[] {
  if (corridor.length < 2) return roadFollowPath(origin, destination);
  const a0 = corridor[0]!;
  const a1 = corridor[corridor.length - 1]!;
  const sLat = (destination.lat - origin.lat) / (a1.lat - a0.lat || 1e-9);
  const sLng = (destination.lng - origin.lng) / (a1.lng - a0.lng || 1e-9);
  return corridor.map((p, i) => {
    if (i === 0) return { ...origin };
    if (i === corridor.length - 1) return { ...destination };
    return {
      lat: origin.lat + (p.lat - a0.lat) * sLat,
      lng: origin.lng + (p.lng - a0.lng) * sLng,
    };
  });
}

/**
 * Approximate Kyoto street / rail corridors for sample-kyoto demo legs.
 * Coordinates track Higashiyama streets, JR Nara Line, and JR Sagano Line.
 */
export const KYOTO_CORRIDORS = {
  /** Kiyomizu-dera → Gion via Kiyomizu-zaka / Higashiōji / Shijō. */
  kiyomizuToGion: [
    { lat: 34.9949, lng: 135.785 },
    { lat: 34.99535, lng: 135.7842 },
    { lat: 34.9959, lng: 135.78315 },
    { lat: 34.99655, lng: 135.7819 },
    { lat: 34.9972, lng: 135.78085 },
    { lat: 34.99785, lng: 135.78015 },
    { lat: 34.99855, lng: 135.77955 },
    { lat: 34.99935, lng: 135.77915 },
    { lat: 35.00025, lng: 135.77885 },
    { lat: 35.00115, lng: 135.7787 },
    { lat: 35.00205, lng: 135.7786 },
    { lat: 35.00285, lng: 135.77855 },
    { lat: 35.00345, lng: 135.77855 },
    { lat: 35.0037, lng: 135.7786 },
  ] satisfies LatLng[],

  /** Walk: temple → Kiyomizu-michi bus stop (down the approach roads). */
  kiyomizuWalkToBus: [
    { lat: 34.9949, lng: 135.785 },
    { lat: 34.9952, lng: 135.78445 },
    { lat: 34.99555, lng: 135.7837 },
    { lat: 34.99595, lng: 135.78285 },
    { lat: 34.99635, lng: 135.7821 },
    { lat: 34.9967, lng: 135.78145 },
  ] satisfies LatLng[],

  /** City bus along Higashiōji toward Yasaka / Gion. */
  kiyomizuBusRide: [
    { lat: 34.9967, lng: 135.78145 },
    { lat: 34.9974, lng: 135.7806 },
    { lat: 34.9982, lng: 135.77985 },
    { lat: 34.9991, lng: 135.77935 },
    { lat: 35.0001, lng: 135.779 },
    { lat: 35.0011, lng: 135.7788 },
    { lat: 35.00195, lng: 135.7787 },
    { lat: 35.0027, lng: 135.77865 },
  ] satisfies LatLng[],

  /** Short walk from Yasaka bus area into Gion lanes. */
  gionWalkFromBus: [
    { lat: 35.0027, lng: 135.77865 },
    { lat: 35.00305, lng: 135.77855 },
    { lat: 35.00335, lng: 135.7785 },
    { lat: 35.00355, lng: 135.77855 },
    { lat: 35.0037, lng: 135.7786 },
  ] satisfies LatLng[],

  /** Walk Fushimi Inari shrine → Inari Station. */
  fushimiWalkToInari: [
    { lat: 34.9671, lng: 135.7727 },
    { lat: 34.96725, lng: 135.77295 },
    { lat: 34.96745, lng: 135.77315 },
    { lat: 34.96755, lng: 135.77285 },
    { lat: 34.96765, lng: 135.77255 },
  ] satisfies LatLng[],

  /** JR Nara Line Inari → Kyoto Station (follows rail northwest). */
  jrNaraInariToKyoto: [
    { lat: 34.96765, lng: 135.77255 },
    { lat: 34.9692, lng: 135.7712 },
    { lat: 34.9714, lng: 135.7693 },
    { lat: 34.9738, lng: 135.7671 },
    { lat: 34.9765, lng: 135.7646 },
    { lat: 34.9792, lng: 135.7624 },
    { lat: 34.9818, lng: 135.7606 },
    { lat: 34.9838, lng: 135.7594 },
    { lat: 34.9858, lng: 135.7588 },
  ] satisfies LatLng[],

  /** JR Sagano Line Kyoto → Saga-Arashiyama (west along Katsura corridor). */
  jrSaganoKyotoToSaga: [
    { lat: 34.9858, lng: 135.7588 },
    { lat: 34.9874, lng: 135.7535 },
    { lat: 34.9896, lng: 135.7468 },
    { lat: 34.9922, lng: 135.7385 },
    { lat: 34.9954, lng: 135.7278 },
    { lat: 34.9988, lng: 135.7155 },
    { lat: 35.0032, lng: 135.7022 },
    { lat: 35.0085, lng: 135.6908 },
    { lat: 35.0132, lng: 135.6835 },
    { lat: 35.0162, lng: 135.6788 },
    { lat: 35.0168, lng: 135.6762 },
  ] satisfies LatLng[],

  /** Walk Saga station area → bamboo grove entrance. */
  sagaWalkToBamboo: [
    { lat: 35.0168, lng: 135.6762 },
    { lat: 35.01695, lng: 135.6748 },
    { lat: 35.01705, lng: 135.6735 },
    { lat: 35.0171, lng: 135.6724 },
    { lat: 35.017, lng: 135.6717 },
  ] satisfies LatLng[],
} as const;

export type KyotoCorridorKey = keyof typeof KYOTO_CORRIDORS;

/** Encode a Kyoto corridor, optionally snapped to live origin/dest. */
export function encodeKyotoCorridor(
  key: KyotoCorridorKey,
  origin?: LatLng,
  destination?: LatLng,
  densify = 2,
): string {
  const raw = [...KYOTO_CORRIDORS[key]];
  const pts =
    origin && destination ? snapCorridor(raw, origin, destination) : raw;
  return encodeSimplePolyline(densifyPath(pts, densify));
}

/** True when a simple polyline is effectively a stop-to-stop chord. */
export function polylineLooksLikeChord(polyline?: string): boolean {
  if (!polyline) return true;
  const parts = polyline
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 4) return true;
  const pts = parts
    .map((part) => {
      const [latS, lngS] = part.split(",");
      return { lat: Number(latS), lng: Number(lngS) };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 4) return true;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const span = haversineM(a, b);
  if (span < 1) return true;
  // Chord if every intermediate point sits near the great-circle segment.
  let maxOff = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const t =
      ((p.lat - a.lat) * (b.lat - a.lat) + (p.lng - a.lng) * (b.lng - a.lng)) /
      ((b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2 || 1e-12);
    const proj = {
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
    };
    maxOff = Math.max(maxOff, haversineM(p, proj));
  }
  // < ~35 m off the chord across a city hop ⇒ straight fake line.
  return maxOff < Math.max(35, span * 0.02);
}
