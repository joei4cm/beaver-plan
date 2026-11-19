import type { LatLng, Leg, Stop } from "@beaver/core";
import {
  collectFitPoints as collectFitPointsCore,
  collectPathLines as collectPathLinesCore,
  strokeForMode as strokeForModeCore,
  type PathLine,
} from "@beaver/core";

export type { PathLine };

export function strokeForMode(mode: string) {
  return strokeForModeCore(mode);
}

export function collectPathLines(stops: Stop[], legs: Leg[]): PathLine[] {
  return collectPathLinesCore(stops, legs);
}

export function collectFitPoints(stops: Stop[], lines: PathLine[]): LatLng[] {
  return collectFitPointsCore(stops, lines);
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
