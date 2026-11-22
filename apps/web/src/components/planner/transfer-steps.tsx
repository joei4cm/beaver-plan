"use client";

import { useRef } from "react";
import type { Leg, TransitStep } from "@beaver/core";
import {
  formatDistance,
  formatDuration,
  formatTransitStepLabel,
  normalizeStepMode,
  summarizeTransfer,
} from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { SheetPresence } from "@/components/ui/sheet-presence";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashClass,
} from "@/components/soft-fail-notice";

type Props = {
  leg: Leg | null;
  locale: Locale;
  /** Compact inline under a stop vs expanded panel. */
  variant?: "inline" | "panel";
  /** Soft demo badge when live Directions keys are absent. */
  demoMode?: boolean;
  /**
   * Show SoftFailNotice under the azure Transfer rail (selected stop only —
   * avoids repeating the notice on every leg row).
   */
  showSoftFail?: boolean;
  /**
   * Soft-fail empty shell when Directions is absent and this stop has
   * no leg / no transit steps yet (selected stop only).
   */
  showEmpty?: boolean;
};

/** Azure section eyebrow — matches place-intel / booking depth chrome. */
function SectionEyebrow({ children }: { children: string }) {
  return (
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
      {children}
    </p>
  );
}

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

function StepIcon({ mode, delayMs }: { mode: string; delayMs: number }) {
  const tone = modeTone(mode);
  return (
    <span
      className={`animate-marker-pop mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tracking-wide ${tone.icon}`}
      style={{ animationDelay: `${delayMs}ms` }}
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
  index,
}: {
  step: TransitStep;
  locale: Locale;
  last: boolean;
  index: number;
}) {
  const kind = normalizeStepMode(step.mode);
  const label = formatTransitStepLabel(step);
  const tone = modeTone(step.mode);
  const delay = 40 + index * 45;
  return (
    <li
      className="animate-rise relative flex gap-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      {!last && (
        <span
          aria-hidden
          className={`absolute left-[11px] top-7 bottom-[-4px] w-0.5 rounded-full transition duration-bp ease-bp-out ${tone.rail}`}
        />
      )}
      <StepIcon mode={step.mode} delayMs={delay} />
      <div className="min-w-0 flex-1 pb-3.5 last:pb-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            {stepKindLabel(locale, step.mode)}
          </span>
          {step.durationSec != null && step.durationSec > 0 && (
            <span className="font-display text-[0.8rem] font-semibold tabular-nums tracking-tight text-river">
              {formatDuration(step.durationSec)}
            </span>
          )}
          {kind === "transit" && step.agency && (
            <span className="text-[11px] text-ink-soft/80">{step.agency}</span>
          )}
        </div>

        {kind === "transit" && step.lineName ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center rounded-bp-xs bg-river/10 px-2 py-0.5 text-xs font-semibold text-river shadow-[inset_2px_0_0_var(--bp-river)] transition duration-bp-fast ease-bp-out">
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

function LegCardHeader({
  locale,
  demoMode,
  softOpen,
  view,
}: {
  locale: Locale;
  demoMode: boolean;
  softOpen: boolean;
  view?: Leg | null;
}) {
  return (
    <header
      className={`relative border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-2 shadow-[inset_3px_0_0_var(--bp-river)] ${
        softOpen ? "bg-mist/35" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
            {t(locale, "planner.transfer.title")}
          </span>
          {softOpen || demoMode ? (
            <SoftFailBadge>
              {softOpen
                ? t(locale, "planner.transfer.softBadge")
                : t(locale, "planner.transfer.demoBadge")}
            </SoftFailBadge>
          ) : (
            <SoftFailLiveBadge>
              {t(locale, "planner.transfer.liveBadge")}
            </SoftFailLiveBadge>
          )}
          {softOpen ? (
            <SoftFailSupport>
              {t(locale, "planner.transfer.softSupport")}
            </SoftFailSupport>
          ) : null}
        </div>
        {view ? (
          <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">
            <span className="font-display text-sm font-semibold tracking-tight text-ink">
              {formatDuration(view.durationSec)}
            </span>
            <span className="mx-1.5 text-ink-soft/40">·</span>
            {formatDistance(view.distanceM)}
            <span className="mx-1.5 text-ink-soft/40">·</span>
            {modeLabel(locale, view.mode)}
          </span>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Transit leg SoftFailNotice depth (BEA-378 after #93 / #121 / Soft badge #280;
 * SoftFailBadge / SoftFailSupport helpers BEA-387 after #284;
 * SoftFailLiveBadge BEA-399):
 * azure Transfer rail · Soft/Live badge · softSupport · compact SoftFail
 * mist band under rail (`border-b`) · tip-011 mist-wash Summary / Steps ·
 * SheetPresence. SoftFail copy always softFail / softFailEmpty — never timber /
 * Failed to fetch. Transit filters SoftFail (#272) yields while TransferSteps
 * owns selected-stop soft chrome (no double depth). Expo transit out of scope.
 */
export function TransferSteps({
  leg,
  locale,
  variant = "inline",
  demoMode = false,
  showSoftFail = false,
  showEmpty = false,
}: Props) {
  const snapRef = useRef<Leg | null>(null);
  if (leg) snapRef.current = leg;

  const view = leg ?? snapRef.current;
  const hasSteps = Boolean(view && view.transitSteps.length > 0);
  const empty = Boolean(showEmpty && !leg);
  const open = Boolean(leg) || empty;
  const softOpen =
    demoMode && (showSoftFail || variant === "panel" || empty);
  const softCopy = empty
    ? t(locale, "planner.transfer.softFailEmpty")
    : t(locale, "planner.transfer.softFail");

  const shell =
    variant === "panel"
      ? "overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft backdrop-blur-sm"
      : "mt-2.5 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft";

  return (
    <SheetPresence
      open={open}
      className={shell}
      style={{ animationDelay: "50ms" }}
      aria-label={t(locale, "planner.transfer.title")}
    >
      {empty ? (
        <>
          {/*
            SoftFail depth (BEA-378): azure Transfer rail · Soft transfer ·
            softSupport · tip-011 — SoftFail under rail; transit filters (#272)
            SoftFail yields while this owns selected-stop soft chrome.
          */}
          <LegCardHeader
            locale={locale}
            demoMode={demoMode}
            softOpen={softOpen}
          />

          {/* Compact SoftFail mist band under azure Transfer rail — never timber. */}
          <SoftFailNotice
            open={softOpen}
            compact
            className="border-b border-[color:var(--bp-line)]"
          >
            {softCopy}
          </SoftFailNotice>

          <div
            className={`animate-fade space-y-1.5 px-3 py-4 ${
              softOpen ? softFailMistWashClass : ""
            }`}
            style={{ animationDelay: "60ms" }}
          >
            <p className="font-display text-sm font-semibold tracking-tight text-ink">
              {t(locale, "planner.transfer.emptyTitle")}
            </p>
            <p className="text-xs leading-relaxed text-ink-soft">
              {t(locale, "planner.transfer.emptyHint")}
            </p>
          </div>
        </>
      ) : view ? (
        <>
          {/*
            SoftFail depth (BEA-378): azure Transfer rail · Soft transfer ·
            softSupport · tip-011 mist-wash — SoftFail under rail; Mode SoftFail
            (#272) yields while TransferSteps owns (no double depth).
          */}
          <LegCardHeader
            locale={locale}
            demoMode={demoMode}
            softOpen={softOpen}
            view={view}
          />

          {/* Compact SoftFail mist band under azure Transfer rail — never timber / Failed to fetch. */}
          <SoftFailNotice
            open={softOpen}
            compact
            className="border-b border-[color:var(--bp-line)]"
          >
            {softCopy}
          </SoftFailNotice>

          <div
            className={`divide-y divide-[color:var(--bp-line)] ${
              softOpen ? softFailMistWashClass : ""
            }`}
          >
            <section
              className="animate-fade space-y-2 px-3 py-3"
              style={{ animationDelay: "55ms" }}
              aria-label={t(locale, "planner.transfer.summaryEyebrow")}
            >
              <SectionEyebrow>
                {t(locale, "planner.transfer.summaryEyebrow")}
              </SectionEyebrow>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="inline-flex items-center rounded-bp-xs bg-river/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river shadow-[inset_2px_0_0_var(--bp-river)]">
                  {modeLabel(locale, view.mode)}
                </span>
                <span className="min-w-0 text-sm font-medium leading-snug text-ink">
                  {summarizeTransfer(view)}
                </span>
              </div>
            </section>

            {hasSteps ? (
              <section
                className="animate-fade px-3 pt-3 pb-1"
                style={{ animationDelay: "75ms" }}
                aria-label={t(locale, "planner.transfer.stepsEyebrow")}
              >
                <SectionEyebrow>
                  {t(locale, "planner.transfer.stepsEyebrow")}
                </SectionEyebrow>
                <ol className="m-0 mt-2.5 list-none space-y-0 p-0">
                  {view.transitSteps.map((step, i) => (
                    <StepRow
                      key={`${view.id}-step-${i}`}
                      step={step}
                      locale={locale}
                      last={i === view.transitSteps.length - 1}
                      index={i}
                    />
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </SheetPresence>
  );
}
