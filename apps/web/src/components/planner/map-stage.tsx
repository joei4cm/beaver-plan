"use client";

import type { Leg, Stop } from "@beaver/core";
import { boundsOf, polylineToPoints, project } from "@/lib/geo";

type Props = {
  stops: Stop[];
  legs: Leg[];
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  engineLabel: string;
  modeLabel: string;
};

const W = 960;
const H = 720;

export function MapStage({
  stops,
  legs,
  selectedStopId,
  onSelectStop,
  engineLabel,
  modeLabel,
}: Props) {
  const coords = stops.map((s) => ({ lat: s.place.lat, lng: s.place.lng }));
  const bounds = boundsOf(coords);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-[20px] border border-[color:var(--bp-line)] bg-river-deep shadow-[inset_0_0_80px_rgba(15,67,57,0.35)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 55% at 30% 20%, rgba(42,157,143,0.35), transparent 55%),
            radial-gradient(ellipse 50% 40% at 80% 70%, rgba(184,107,60,0.22), transparent 50%),
            linear-gradient(160deg, #0f4339 0%, #14201c 55%, #1a2e28 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40h80M40 0v80' stroke='%23f7faf8' stroke-width='0.6' fill='none'/%3E%3C/svg%3E\")",
        }}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="relative z-[1] h-full w-full"
        role="img"
        aria-label="Trip map"
      >
        {legs.map((leg) => {
          const pts = polylineToPoints(leg.polyline, bounds, W, H);
          if (pts.length < 2) {
            const from = stops.find((s) => s.id === leg.fromStopId);
            const to = stops.find((s) => s.id === leg.toStopId);
            if (!from || !to) return null;
            const a = project(from.place, bounds, W, H);
            const b = project(to.place, bounds, W, H);
            return (
              <line
                key={leg.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(247,250,248,0.45)"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={leg.mode === "transit" ? "8 6" : undefined}
              />
            );
          }
          const d = pts
            .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(" ");
          return (
            <path
              key={leg.id}
              d={d}
              fill="none"
              stroke="rgba(247,250,248,0.55)"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={leg.mode === "transit" ? "10 7" : undefined}
            />
          );
        })}

        {stops.map((stop, index) => {
          const p = project(stop.place, bounds, W, H);
          const selected = stop.id === selectedStopId;
          return (
            <g
              key={stop.id}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer"
              onClick={() => onSelectStop(stop.id)}
            >
              {selected && (
                <circle
                  r={22}
                  fill="none"
                  stroke="rgba(247,250,248,0.55)"
                  strokeWidth={2}
                  className="animate-pulse"
                />
              )}
              <circle
                r={selected ? 14 : 11}
                fill={selected ? "#b86b3c" : "#f7faf8"}
                stroke={selected ? "#f7faf8" : "#1f6b5c"}
                strokeWidth={2.5}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={700}
                fill={selected ? "#f7faf8" : "#0f4339"}
              >
                {index + 1}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute left-4 top-4 z-[2] flex flex-col gap-1">
        <span className="rounded-md bg-foam/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-river-deep backdrop-blur">
          {engineLabel}
        </span>
        <span className="text-[11px] text-foam/75">{modeLabel}</span>
      </div>
    </div>
  );
}
