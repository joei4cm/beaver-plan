import type { LatLng, Leg, Stop } from "@beaver/core";
import {
  collectFitPoints as collectFitPointsCore,
  collectPathLines as collectPathLinesCore,
  strokeForMode as strokeForModeCore,
  type PathLine,
} from "@beaver/core";

export type { PathLine };

/** Leaflet DivIcon footprint — room for active scale + halo without clipping. */
export const MARKER_ICON_SIZE = 40;
export const MARKER_ICON_ANCHOR = MARKER_ICON_SIZE / 2;

export function strokeForMode(mode: string) {
  return strokeForModeCore(mode);
}

export function collectPathLines(stops: Stop[], legs: Leg[]): PathLine[] {
  return collectPathLinesCore(stops, legs);
}

export function collectFitPoints(stops: Stop[], lines: PathLine[]): LatLng[] {
  return collectFitPointsCore(stops, lines);
}

export type MarkerHtmlOpts = {
  /** Center via translate(-50%,-50%) for absolute vendor overlays. */
  centerWithTransform?: boolean;
  /**
   * Play tip-011 overshoot pop (select / first paint).
   * Prefer true only for the newly selected pin so siblings stay calm.
   */
  pop?: boolean;
};

/**
 * Numbered Lumen stop pin HTML shared by Leaflet (and Amap content).
 * Active state is class-driven so CSS can own tip-011 overshoot scale.
 */
export function markerHtml(
  index: number,
  selected: boolean,
  opts?: MarkerHtmlOpts,
): string {
  const classes = [
    "bp-map-marker",
    selected ? "bp-map-marker--active" : "",
    opts?.pop ? "animate-marker-pop" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const center = opts?.centerWithTransform
    ? "transform:translate(-50%,-50%);"
    : "";
  return `<button type="button" class="${classes}" aria-label="Stop ${index + 1}" aria-pressed="${selected ? "true" : "false"}" style="${center}">${index + 1}</button>`;
}
