"use client";

import type { Leg, Stop } from "@beaver/core";
import { legPathSegments } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { boundsOf, polylineToPoints, project } from "@/lib/geo";

type Props = {
  stops: Stop[];
  legs: Leg[];
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  engineLabel: string;
  modeLabel: string;
  locale?: Locale;
};

const W = 960;
const H = 720;

function strokeForMode(mode: string): {
  stroke: string;
  strokeWidth: number;
  dash?: string;
  opacity: number;
} {
  switch (mode) {
    case "walk":
      return {
        stroke: "#64748B",
        strokeWidth: 2.5,
        dash: "5 7",
        opacity: 0.9,
      };
    case "transit":
      return {
        stroke: "#2F6BFF",
        strokeWidth: 4,
        opacity: 1,
      };
    case "transfer":
      return {
        stroke: "#E11D48",
        strokeWidth: 2.5,
        dash: "3 5",
        opacity: 0.9,
      };
    case "drive":
      return {
        stroke: "#1A4FD6",
        strokeWidth: 3.5,
        opacity: 1,
      };
    default:
      return {
        stroke: "#94A3B8",
        strokeWidth: 3,
        opacity: 0.9,
      };
  }
}

export function MapStage({
  stops,
  legs,
  selectedStopId,
  onSelectStop,
  engineLabel,
  modeLabel,
  locale = "zh-CN",
}: Props) {
  const coords = stops.map((s) => ({ lat: s.place.lat, lng: s.place.lng }));
  const bounds = boundsOf(coords);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden bg-[#EAF0F8] lg:min-h-[640px] lg:rounded-none">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 65% 50% at 30% 22%, rgba(47,107,255,0.14), transparent 55%),
            radial-gradient(ellipse 40% 35% at 78% 70%, rgba(96,165,250,0.12), transparent 50%),
            linear-gradient(160deg, #eef3fb 0%, #e4ebf5 55%, #dce5f2 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='72' height='72' viewBox='0 0 72 72' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 36h72M36 0v72' stroke='%232F6BFF' stroke-width='0.5' stroke-opacity='0.18' fill='none'/%3E%3C/svg%3E\")",
        }}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="relative z-[1] h-full w-full"
        role="img"
        aria-label="Trip map"
      >
        {legs.map((leg) => {
          const segments = legPathSegments(leg);
          const rendered = segments.map((seg, si) => {
            const pts = polylineToPoints(seg.polyline, bounds, W, H);
            if (pts.length < 2) return null;
            const style = strokeForMode(seg.mode);
            const d = pts
              .map(
                (p, i) =>
                  `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
              )
              .join(" ");
            return (
              <path
                key={`${leg.id}-seg-${si}`}
                d={d}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={style.dash}
                opacity={style.opacity}
              />
            );
          });

          if (rendered.some(Boolean)) return rendered;

          const from = stops.find((s) => s.id === leg.fromStopId);
          const to = stops.find((s) => s.id === leg.toStopId);
          if (!from || !to) return null;
          const a = project(from.place, bounds, W, H);
          const b = project(to.place, bounds, W, H);
          const style = strokeForMode(
            leg.mode === "walk"
              ? "walk"
              : leg.mode === "drive"
                ? "drive"
                : "transit",
          );
          return (
            <line
              key={leg.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeLinecap="round"
              strokeDasharray={style.dash}
              opacity={style.opacity}
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
              <g
                key={selected ? `sel-${stop.id}` : `idle-${stop.id}`}
                style={
                  selected
                    ? {
                        transformOrigin: "0 0",
                        animation:
                          "bp-marker-pop 380ms cubic-bezier(0.16, 1, 0.3, 1) both",
                      }
                    : undefined
                }
              >
                {selected && (
                  <circle
                    r={24}
                    fill="none"
                    stroke="rgba(47,107,255,0.45)"
                    strokeWidth={1.75}
                    opacity={0.9}
                  >
                    <animate
                      attributeName="r"
                      values="18;26;18"
                      dur="1.8s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.7;0.25;0.7"
                      dur="1.8s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                <circle
                  r={selected ? 14 : 11}
                  fill={selected ? "#2F6BFF" : "#FFFFFF"}
                  stroke={selected ? "#FFFFFF" : "#2F6BFF"}
                  strokeWidth={2.5}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontWeight={700}
                  fill={selected ? "#FFFFFF" : "#0F172A"}
                >
                  {index + 1}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute left-4 top-4 z-[2] flex flex-col gap-1">
        <span className="rounded-bp bg-foam/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink shadow-bp-soft backdrop-blur">
          {engineLabel}
        </span>
        <span className="text-[11px] font-medium text-ink-soft">{modeLabel}</span>
      </div>

      {legs.some((l) => legPathSegments(l).length > 0) && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-[2] flex flex-wrap gap-3 rounded-bp bg-foam/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft shadow-bp-soft backdrop-blur">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 border-t-2 border-dashed border-ink-soft"
              aria-hidden
            />
            {t(locale, "planner.transfer.walk")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 bg-river"
              aria-hidden
            />
            {t(locale, "planner.transfer.ride")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 border-t-2 border-dashed border-timber"
              aria-hidden
            />
            {t(locale, "planner.transfer.change")}
          </span>
        </div>
      )}
    </div>
  );
}
