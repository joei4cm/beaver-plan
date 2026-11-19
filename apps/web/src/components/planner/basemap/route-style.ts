import type { LatLng, Leg, Stop } from "@beaver/core";
import {
  decodeSimplePolyline,
  encodeRoadPolyline,
  legPathSegments,
} from "@beaver/core";
import type { PathLine } from "./types";

export function strokeForMode(mode: string): {
  color: string;
  width: number;
  dasharray?: number[];
  opacity: number;
} {
  switch (mode) {
    case "walk":
      return { color: "#64748B", width: 3, dasharray: [1.2, 1.6], opacity: 0.95 };
    case "transit":
      return { color: "#2F6BFF", width: 4.5, opacity: 1 };
    case "transfer":
      return { color: "#E11D48", width: 3, dasharray: [0.8, 1.2], opacity: 0.95 };
    case "drive":
      return { color: "#1A4FD6", width: 4, opacity: 1 };
    default:
      return { color: "#94A3B8", width: 3.5, opacity: 0.9 };
  }
}

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
    const fallback = encodeRoadPolyline(
      { lat: from.place.lat, lng: from.place.lng },
      { lat: to.place.lat, lng: to.place.lng },
      { mode },
    );
    const points = decodeSimplePolyline(fallback);
    if (points.length < 2) continue;
    lines.push({ id: leg.id, mode, points });
  }
  return lines;
}

export function collectFitPoints(stops: Stop[], lines: PathLine[]): LatLng[] {
  const pts: LatLng[] = stops.map((s) => ({
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

export function markerHtml(
  index: number,
  selected: boolean,
  opts?: { centerWithTransform?: boolean },
): string {
  const size = selected ? 28 : 22;
  const bg = selected ? "#2F6BFF" : "#FFFFFF";
  const fg = selected ? "#FFFFFF" : "#0F172A";
  const ring = selected
    ? "box-shadow:0 0 0 3px rgba(47,107,255,0.35),0 4px 14px rgba(15,23,42,0.18);"
    : "box-shadow:0 2px 8px rgba(15,23,42,0.16);";
  const center = opts?.centerWithTransform
    ? "transform:translate(-50%,-50%);"
    : "";
  return `<button type="button" aria-label="Stop ${index + 1}" style="
    width:${size}px;height:${size}px;border-radius:999px;border:2.5px solid #2F6BFF;
    background:${bg};color:${fg};font:700 11px/1 'Plus Jakarta Sans',system-ui,sans-serif;
    display:grid;place-items:center;cursor:pointer;padding:0;${ring}${center}
  ">${index + 1}</button>`;
}
