import type { Leg, Stop } from "../domain.js";
import type { LatLng } from "../ports.js";
import { legPathSegments } from "../itinerary.js";
import { encodeRoadPolyline } from "./demo-road-paths.js";
import { decodeSimplePolyline } from "./polyline.js";

type Point = LatLng;

export type PathLine = {
  id: string;
  mode: string;
  points: Point[];
};

export type PathStroke = {
  color: string;
  width: number;
  dasharray?: number[];
  opacity: number;
};

/** Lumen Route stroke styles shared by web + Expo overlays. */
export function strokeForMode(mode: string): PathStroke {
  switch (mode) {
    case "walk":
      return { color: "#64748B", width: 3, dasharray: [1.2, 1.6], opacity: 0.95 };
    case "transit":
      return { color: "#2F6BFF", width: 4.5, opacity: 1 };
    case "transfer":
      // Soft azure dash — timber is reserved for errors, not transfer chrome.
      return { color: "#60A5FA", width: 3, dasharray: [0.8, 1.2], opacity: 0.95 };
    case "drive":
      return { color: "#1A4FD6", width: 4, opacity: 1 };
    default:
      return { color: "#94A3B8", width: 3.5, opacity: 0.9 };
  }
}

function pushRoadLine(
  lines: PathLine[],
  id: string,
  mode: string,
  from: Point,
  to: Point,
) {
  const fallback = encodeRoadPolyline(from, to, {
    mode: mode === "walk" || mode === "drive" ? mode : "transit",
  });
  try {
    const points = decodeSimplePolyline(fallback);
    if (points.length < 2) return;
    lines.push({ id, mode, points });
  } catch {
    /* ignore bad soft-fail geometry */
  }
}

/**
 * Collect road-following polylines for a day: prefer encoded leg segments,
 * else synthesize demo road geometry between adjacent stops.
 * Soft-fail when routing/legs are absent — still draw road-following paths
 * between ordered stops (never straight chords).
 */
export function collectPathLines(stops: Stop[], legs: Leg[]): PathLine[] {
  const lines: PathLine[] = [];
  for (const leg of legs) {
    const segments = legPathSegments(leg);
    let added = false;
    segments.forEach((seg, si) => {
      if (!seg.polyline) return;
      try {
        const points = decodeSimplePolyline(seg.polyline);
        if (points.length < 2) return;
        lines.push({
          id: `${leg.id}-seg-${si}`,
          mode: seg.mode,
          points,
        });
        added = true;
      } catch {
        /* ignore bad polyline */
      }
    });
    if (added) continue;

    const from = stops.find((s) => s.id === leg.fromStopId);
    const to = stops.find((s) => s.id === leg.toStopId);
    if (!from || !to) continue;
    const mode =
      leg.mode === "walk" ? "walk" : leg.mode === "drive" ? "drive" : "transit";
    pushRoadLine(
      lines,
      leg.id,
      mode,
      { lat: from.place.lat, lng: from.place.lng },
      { lat: to.place.lat, lng: to.place.lng },
    );
  }

  // Soft-fail: Directions/routing absent (empty legs) — still paint azure roads.
  if (lines.length === 0 && stops.length >= 2) {
    const ordered = [...stops].sort((a, b) => a.order - b.order);
    for (let i = 0; i < ordered.length - 1; i++) {
      const from = ordered[i]!;
      const to = ordered[i + 1]!;
      pushRoadLine(
        lines,
        `soft-${from.id}-${to.id}`,
        "transit",
        { lat: from.place.lat, lng: from.place.lng },
        { lat: to.place.lat, lng: to.place.lng },
      );
    }
  }
  return lines;
}

export function collectFitPoints(stops: Stop[], lines: PathLine[]): Point[] {
  const pts: Point[] = stops.map((s) => ({
    lat: s.place.lat,
    lng: s.place.lng,
  }));
  for (const line of lines) {
    for (const p of line.points) pts.push(p);
  }
  if (pts.length === 0) {
    return [
      { lat: 35.0116, lng: 135.7681 },
      { lat: 35.039, lng: 135.73 },
    ];
  }
  return pts;
}
