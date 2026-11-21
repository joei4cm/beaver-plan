import type { LatLng, Leg, Stop } from "@beaver/core";
import {
  collectFitPoints as collectFitPointsCore,
  collectPathLines as collectPathLinesCore,
  strokeForMode as strokeForModeCore,
  type PathLine,
} from "@beaver/core";

export type { PathLine };

/** Leaflet DivIcon footprint — room for active scale + halo breathe without clipping. */
export const MARKER_ICON_SIZE = 48;
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
 * Shell owns ground shadow + halo; button owns tip-011 overshoot scale.
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
  const shellClasses = [
    "bp-map-marker-shell",
    selected ? "bp-map-marker-shell--active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const center = opts?.centerWithTransform
    ? "transform:translate(-50%,-50%);"
    : "";
  const halo = selected
    ? `<span class="bp-map-marker-halo" aria-hidden="true"></span>`
    : "";
  return `<span class="${shellClasses}" style="${center}">${halo}<button type="button" class="${classes}" aria-label="Stop ${index + 1}" aria-pressed="${selected ? "true" : "false"}">${index + 1}</button></span>`;
}
