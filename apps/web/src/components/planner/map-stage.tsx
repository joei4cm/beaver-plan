"use client";

import dynamic from "next/dynamic";
import type { Leg, MapEngineId, Stop } from "@beaver/core";
import { legPathSegments } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import {
  basemapProviderLabel,
  resolveBasemapKind,
} from "./basemap/resolve-basemap";

const InteractiveBasemap = dynamic(
  () =>
    import("./basemap/interactive-basemap").then((m) => m.InteractiveBasemap),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 animate-pulse bg-[#EAF0F8]" />
    ),
  },
);

type Props = {
  stops: Stop[];
  legs: Leg[];
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  engineLabel: string;
  modeLabel: string;
  engineId?: MapEngineId;
  locale?: Locale;
};

export function MapStage({
  stops,
  legs,
  selectedStopId,
  onSelectStop,
  engineLabel,
  modeLabel,
  engineId,
  locale = "zh-CN",
}: Props) {
  const basemapKind = resolveBasemapKind(engineId);
  const tileLabel = basemapProviderLabel(basemapKind);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden bg-[#EAF0F8] lg:min-h-[640px] lg:rounded-none">
      <InteractiveBasemap
        stops={stops}
        legs={legs}
        selectedStopId={selectedStopId}
        onSelectStop={onSelectStop}
        engineId={engineId}
      />

      <div className="pointer-events-none absolute left-4 top-4 z-[2] flex flex-col gap-1">
        <span className="rounded-bp bg-foam/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink shadow-bp-soft backdrop-blur">
          {engineLabel}
        </span>
        <span className="text-[11px] font-medium text-ink-soft">
          {modeLabel} · {tileLabel}
        </span>
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
            <span className="inline-block h-0.5 w-4 bg-river" aria-hidden />
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
