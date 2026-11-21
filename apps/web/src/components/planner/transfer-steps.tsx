"use client";

import type { Leg, TransitStep } from "@beaver/core";
import {
  formatDuration,
  formatTransitStepLabel,
  normalizeStepMode,
} from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";

type Props = {
  leg: Leg;
  locale: Locale;
  /** Compact inline under a stop vs expanded panel. */
  variant?: "inline" | "panel";
  /** Soft demo badge when live Directions keys are absent. */
  demoMode?: boolean;
};

function stepKindLabel(locale: Locale, mode: string): string {
  const kind = normalizeStepMode(mode);
  const key =
    kind === "walk"
      ? "planner.transfer.walk"
      : kind === "transit"
        ? "planner.transfer.ride"
        : kind === "transfer"
          ? "planner.transfer.change"
          : kind === "drive"
            ? "planner.mode.drive"
            : kind === "wait"
              ? "planner.transfer.wait"
              : "planner.transfer.step";
  return t(locale, key);
}

function modeTone(mode: string): {
  icon: string;
  rail: string;
  mark: string;
} {
  const kind = normalizeStepMode(mode);
  switch (kind) {
    case "walk":
      return {
        icon: "border border-dashed border-ink-soft/55 bg-mist/80 text-ink-soft",
        rail: "bg-ink-soft/35",
        mark: "··",
      };
    case "transit":
      return {
        icon: "bg-river text-foam shadow-[0_0_0_3px_rgba(47,107,255,0.16)]",
        rail: "bg-river/55",
        mark: "●",
      };
    case "transfer":
      return {
        icon: "border border-river/40 bg-river/10 text-river",
        rail: "bg-river/30",
        mark: "↔",
      };
    case "drive":
      return {
        icon: "bg-ink text-foam",
        rail: "bg-ink/40",
        mark: "▶",
      };
    default:
      return {
        icon: "bg-mist text-ink-soft",
        rail: "bg-[color:var(--bp-line)]",
        mark: "·",
      };
  }
}

function StepIcon({ mode }: { mode: string }) {
  const tone = modeTone(mode);
  return (
    <span
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tracking-wide ${tone.icon}`}
      aria-hidden
    >
      {tone.mark}
    </span>
  );
}

function StepRow({
  step,
  locale,
  last,
}: {
  step: TransitStep;
  locale: Locale;
  last: boolean;
}) {
  const kind = normalizeStepMode(step.mode);
  const label = formatTransitStepLabel(step);
  const tone = modeTone(step.mode);
  return (
    <li className="relative flex gap-3">
      {!last && (
        <span
          aria-hidden
          className={`absolute left-[11px] top-7 bottom-[-4px] w-0.5 rounded-full ${tone.rail}`}
        />
      )}
      <StepIcon mode={step.mode} />
      <div className="min-w-0 flex-1 pb-3.5 last:pb-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            {stepKindLabel(locale, step.mode)}
          </span>
          {step.durationSec != null && step.durationSec > 0 && (
            <span className="text-[11px] font-semibold tabular-nums text-river">
              {formatDuration(step.durationSec)}
            </span>
          )}
          {kind === "transit" && step.agency && (
            <span className="text-[11px] text-ink-soft/80">{step.agency}</span>
          )}
        </div>

        {kind === "transit" && step.lineName ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center rounded-bp-xs bg-river/10 px-2 py-0.5 text-xs font-semibold text-river">
              <span className="truncate">{step.lineName}</span>
            </span>
            {step.fromStopName && step.toStopName && (
              <span className="min-w-0 truncate text-xs text-ink-soft">
                {step.fromStopName}
                <span className="mx-1 text-river/70">→</span>
                {step.toStopName}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-0.5 text-sm leading-snug text-ink">{label}</div>
        )}

        {kind === "transit" &&
          step.instruction &&
          step.instruction !== label &&
          step.instruction !== step.lineName && (
            <div className="mt-1 truncate text-xs text-ink-soft">
              {step.instruction}
            </div>
          )}
      </div>
    </li>
  );
}

function modeLabel(locale: Locale, mode: Leg["mode"]): string {
  if (mode === "transit") return t(locale, "planner.mode.transit");
  if (mode === "walk") return t(locale, "planner.mode.walk");
  return t(locale, "planner.mode.drive");
}

/**
 * Transfer / transit step list — Lumen Route hierarchy under itinerary stops.
 * Soft chrome only; demo badge when Directions keys are absent.
 */
export function TransferSteps({
  leg,
  locale,
  variant = "inline",
  demoMode = false,
}: Props) {
  if (leg.transitSteps.length === 0) return null;

  const shell =
    variant === "panel"
      ? "animate-sheet-in rounded-bp border border-[color:var(--bp-line)] bg-foam/95 px-3.5 py-3 shadow-bp-soft backdrop-blur-sm"
      : "animate-sheet-in mt-2.5 rounded-bp border border-[color:var(--bp-line)] bg-paper/70 px-3 py-2.5 shadow-bp-soft";

  return (
    <div className={shell} style={{ animationDelay: "50ms" }}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
            {t(locale, "planner.transfer.title")}
          </span>
          {demoMode && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-river/70">
              {t(locale, "planner.transfer.demoBadge")}
            </span>
          )}
        </div>
        <span className="text-[11px] tabular-nums text-ink-soft">
          {formatDuration(leg.durationSec)}
          <span className="mx-1 text-ink-soft/40">·</span>
          {modeLabel(locale, leg.mode)}
        </span>
      </div>
      <ol className="m-0 list-none p-0">
        {leg.transitSteps.map((step, i) => (
          <StepRow
            key={`${leg.id}-step-${i}`}
            step={step}
            locale={locale}
            last={i === leg.transitSteps.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}
