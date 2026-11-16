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

function StepIcon({ mode }: { mode: string }) {
  const kind = normalizeStepMode(mode);
  const tone =
    kind === "walk"
      ? "bg-mist text-river-deep"
      : kind === "transit"
        ? "bg-river text-foam"
        : kind === "transfer"
          ? "bg-timber/90 text-foam"
          : kind === "drive"
            ? "bg-ink-soft text-foam"
            : "bg-mist text-ink-soft";
  const mark =
    kind === "walk"
      ? "步"
      : kind === "transit"
        ? "线"
        : kind === "transfer"
          ? "换"
          : kind === "drive"
            ? "车"
            : "·";
  return (
    <span
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tracking-wide ${tone}`}
      aria-hidden
    >
      {mark}
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
  return (
    <li className="relative flex gap-3">
      {!last && (
        <span
          aria-hidden
          className="absolute left-[11px] top-7 bottom-[-6px] w-px bg-[color:var(--bp-line)]"
        />
      )}
      <StepIcon mode={step.mode} />
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft">
            {stepKindLabel(locale, step.mode)}
          </span>
          {step.durationSec != null && step.durationSec > 0 && (
            <span className="text-[11px] text-river">
              {formatDuration(step.durationSec)}
            </span>
          )}
          {kind === "transit" && step.agency && (
            <span className="text-[11px] text-ink-soft/80">{step.agency}</span>
          )}
        </div>
        <div className="mt-0.5 text-sm leading-snug text-ink">{label}</div>
        {kind === "transit" && step.lineName && step.instruction !== label && (
          <div className="mt-0.5 truncate text-xs text-ink-soft">
            {step.instruction}
          </div>
        )}
      </div>
    </li>
  );
}

export function TransferSteps({ leg, locale, variant = "inline" }: Props) {
  if (leg.transitSteps.length === 0) return null;

  const shell =
    variant === "panel"
      ? "rounded-md border border-[color:var(--bp-line)] bg-foam/70 px-3 py-3"
      : "mt-2 rounded-md bg-mist/35 px-3 py-2.5";

  return (
    <div className={shell}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-river">
          {t(locale, "planner.transfer.title")}
        </span>
        <span className="text-[11px] text-ink-soft">
          {formatDuration(leg.durationSec)}
          {" · "}
          {leg.mode === "transit"
            ? t(locale, "planner.mode.transit")
            : leg.mode === "walk"
              ? t(locale, "planner.mode.walk")
              : t(locale, "planner.mode.drive")}
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
