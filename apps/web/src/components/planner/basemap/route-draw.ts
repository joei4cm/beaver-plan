import type { PathLine } from "./route-style";

/** Stable signature so selection/pan does not restart draw-in. */
export function routeDrawSignature(lines: PathLine[]): string {
  return lines
    .map((line) => {
      const head = line.points[0];
      const tail = line.points[line.points.length - 1];
      return [
        line.id,
        line.mode,
        line.points.length,
        head ? `${head.lat.toFixed(5)},${head.lng.toFixed(5)}` : "",
        tail ? `${tail.lat.toFixed(5)},${tail.lng.toFixed(5)}` : "",
      ].join(":");
    })
    .join("|");
}

/**
 * Arm tip-011 stroke draw-in on a Leaflet SVG path.
 * Uses pathLength=1 so CSS can animate dashoffset with ease tokens.
 */
export function armLeafletRouteDraw(
  pathEl: SVGPathElement | null | undefined,
  opts: { delayMs?: number; restoreDash?: string },
): void {
  if (!pathEl) return;
  pathEl.setAttribute("pathLength", "1");
  pathEl.style.setProperty("--bp-route-delay", `${opts.delayMs ?? 0}ms`);
  pathEl.classList.add("bp-route-polyline--draw");

  if (!opts.restoreDash) return;

  const onEnd = (ev: AnimationEvent) => {
    if (ev.animationName !== "bp-map-route-draw") return;
    pathEl.classList.remove("bp-route-polyline--draw");
    pathEl.style.strokeDasharray = opts.restoreDash!;
    pathEl.style.strokeDashoffset = "0";
    pathEl.removeEventListener("animationend", onEnd);
  };
  pathEl.addEventListener("animationend", onEnd);
}
