"use client";

import { useEffect, useState } from "react";
import {
  DAY_FILL_INTERESTS,
  DEMO_PLACES,
  DemoDayFillProvider,
  materializeDayFill,
  tripDatesFromDays,
  type Day,
  type DayFillInterest,
  type DayFillProposal,
  type Stop,
  type Trip,
} from "@beaver/core";
import type { Locale, MessageKey } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashClass,
} from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
import { DayFillSkeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";

type Props = {
  tripId: string;
  locale: Locale;
  trip: Trip;
  days: Day[];
  stops: Stop[];
  dayCountHint: number;
  onApplied: () => Promise<void>;
  onLocalApplied?: (next: {
    trip: Trip;
    days: Day[];
    stops: Stop[];
  }) => void;
  onError: (message: string) => void;
};

type StatusResponse = {
  mode: "live" | "demo";
  provider: string;
};

const DEFAULT_INTERESTS: DayFillInterest[] = ["temples", "food", "culture"];

const INTEREST_KEYS: Record<DayFillInterest, MessageKey> = {
  temples: "planner.dayFill.interest.temples",
  food: "planner.dayFill.interest.food",
  nature: "planner.dayFill.interest.nature",
  shopping: "planner.dayFill.interest.shopping",
  culture: "planner.dayFill.interest.culture",
  photo: "planner.dayFill.interest.photo",
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildLocalDemoProposal(input: {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  interests: DayFillInterest[];
  walkMinutes: number;
  dayCount: number;
  locale: Locale;
}): Promise<DayFillProposal> {
  const provider = new DemoDayFillProvider();
  const result = await provider.propose({
    trip: input.trip,
    days: input.days,
    stops: input.stops,
    prefs: {
      interests: input.interests,
      maxWalkMinutesPerDay: input.walkMinutes,
      dayCount: input.dayCount,
    },
    catalog: DEMO_PLACES,
    locale: input.locale,
  });
  return {
    id: newId(),
    tripId: input.trip.id,
    mode: "demo",
    provider: provider.id,
    prefs: {
      interests: input.interests,
      maxWalkMinutesPerDay: input.walkMinutes,
      dayCount: input.dayCount,
    },
    rationale: result.rationale,
    days: result.days,
    createdAt: new Date().toISOString(),
  };
}

/** Azure section eyebrow — matches booking / place-intel depth chrome. */
function SectionEyebrow({ children }: { children: string }) {
  return (
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
      {children}
    </p>
  );
}

/**
 * Planner day-fill sheet — SoftFail depth kept (BEA-323 / BEA-400 / BEA-408) +
 * wave 48–56 (#340/#367/#387) + wave 60 (BEA-576) + wave 62 craft residual
 * (BEA-604): DayFillSkeleton day-row rise mirrors live proposal stagger.
 * SoftFailBadge Soft fill · SoftFailSupport · mist band unchanged. Stop drawer
 * SoftFail (#225) owns Itinerary. Soft-fails to local Kyoto demo — never
 * timber / Failed to fetch. No `/dev` gallery.
 */
export function DayFillPanel({
  tripId,
  locale,
  trip,
  days,
  stops,
  dayCountHint,
  onApplied,
  onLocalApplied,
  onError,
}: Props) {
  const [open, setOpen] = useState(true);
  const [interests, setInterests] = useState<DayFillInterest[]>(DEFAULT_INTERESTS);
  const [walkMinutes, setWalkMinutes] = useState(60);
  const [dayCount, setDayCount] = useState(
    Math.max(1, Math.min(7, dayCountHint || 3)),
  );
  const [proposal, setProposal] = useState<DayFillProposal | null>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [softDemo, setSoftDemo] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Craft preview: /trips/…?dayFillSoftFail=1 — SoftFail depth under Day fill. */
  const [dayFillSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("dayFillSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    void apiGet<StatusResponse>("/v1/day-fill/status")
      .then((res) => {
        if (!cancelled) {
          setStatus({ mode: res.mode, provider: res.provider });
          setSoftDemo(false);
          setNotice(
            res.mode === "demo" ? t(locale, "planner.dayFill.demoNotice") : null,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ mode: "demo", provider: "demo-day-fill" });
          setSoftDemo(true);
          setNotice(t(locale, "planner.dayFill.softFail"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  function toggleInterest(id: DayFillInterest) {
    setInterests((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  async function generate() {
    setGenerating(true);
    setNotice(null);
    onError("");
    try {
      const res = await apiSend<{ proposal: DayFillProposal }>(
        `/v1/trips/${tripId}/day-fill/propose`,
        "POST",
        {
          interests,
          maxWalkMinutesPerDay: walkMinutes,
          dayCount,
          locale,
        },
      );
      setProposal(res.proposal);
      setLocalOnly(false);
      setSoftDemo(false);
      setStatus({ mode: res.proposal.mode, provider: res.proposal.provider });
      if (res.proposal.mode === "demo") {
        setNotice(t(locale, "planner.dayFill.demoNotice"));
      }
    } catch (e) {
      // Soft-fail: keys/Neon/API absent → local scripted draft, never timber noise.
      try {
        const draft = await buildLocalDemoProposal({
          trip,
          days,
          stops,
          interests,
          walkMinutes,
          dayCount,
          locale,
        });
        setProposal(draft);
        setLocalOnly(true);
        setSoftDemo(isPlannerNoiseError(e));
        setStatus({ mode: "demo", provider: draft.provider });
        setNotice(
          isPlannerNoiseError(e)
            ? t(locale, "planner.dayFill.softFail")
            : t(locale, "planner.dayFill.demoNotice"),
        );
        onError("");
      } catch {
        if (isPlannerNoiseError(e)) {
          setSoftDemo(true);
          setNotice(t(locale, "planner.dayFill.softFail"));
          onError("");
        } else {
          onError(e instanceof Error ? e.message : "day_fill_failed");
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  function applyLocally(draft: DayFillProposal) {
    if (!onLocalApplied) {
      setNotice(t(locale, "planner.dayFill.applySoftFail"));
      return;
    }
    const engine =
      trip.mapEngine === "amap" ||
      trip.mapEngine === "baidu" ||
      trip.mapEngine === "google"
        ? trip.mapEngine
        : "google";
    const { days: nextDays, stops: nextStops } = materializeDayFill({
      trip,
      proposal: draft,
      existingDays: days,
      engine,
      newId,
    });
    const dates = tripDatesFromDays(nextDays);
    onLocalApplied({
      trip: {
        ...trip,
        version: trip.version + 1,
        startDate: dates.startDate ?? trip.startDate,
        endDate: dates.endDate ?? trip.endDate,
        updatedAt: new Date().toISOString(),
      },
      days: nextDays,
      stops: nextStops,
    });
    setProposal(null);
    setLocalOnly(false);
    setNotice(t(locale, "planner.dayFill.appliedLocal"));
    onError("");
  }

  async function apply() {
    if (!proposal) return;
    setApplying(true);
    setNotice(null);
    onError("");
    try {
      if (localOnly) {
        applyLocally(proposal);
        return;
      }
      await apiSend(`/v1/trips/${tripId}/day-fill/apply`, "POST", {
        proposal,
        expectedVersion: trip.version,
      });
      setProposal(null);
      setLocalOnly(false);
      await onApplied();
    } catch (e) {
      if (isPlannerNoiseError(e)) {
        applyLocally(proposal);
      } else {
        onError(e instanceof Error ? e.message : "apply_failed");
      }
    } finally {
      setApplying(false);
    }
  }

  const mode = proposal?.mode ?? status?.mode ?? "demo";
  const demoMode = mode === "demo" || localOnly || softDemo;
  const badge =
    mode === "live"
      ? t(locale, "planner.dayFill.liveBadge")
      : t(locale, "planner.dayFill.demoBadge");
  /**
   * Day-fill SoftFailNotice depth (BEA-323 after #206; helpers BEA-400) +
   * craft SoftFail query parity (BEA-408):
   * azure sheet rail · SoftFailBadge Soft fill · SoftFailSupport · compact
   * SoftFail mist band (`border-b`) · softFailMistWash tip-011 body while soft.
   * Craft: /trips/…?dayFillSoftFail=1 — forces softFail copy under Day fill.
   * Stop drawer SoftFail (#225) owns Itinerary — no double depth. Soft copy
   * never timber / Failed to fetch.
   */
  const softFailCopy = t(locale, "planner.dayFill.softFail");
  const softCopy = dayFillSoftPreview
    ? softFailCopy
    : (notice ??
      (softDemo
        ? softFailCopy
        : demoMode
          ? t(locale, "planner.dayFill.demoNotice")
          : null));
  const showSoftFail = Boolean(softCopy);
  const sheetSupportCopy = showSoftFail
    ? t(locale, "planner.dayFill.softSupport")
    : t(locale, "planner.dayFill.support");
  const dayCountLabel = t(locale, "planner.dayFill.dayCount").replace(
    "{n}",
    String(dayCount),
  );

  return (
    <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-bp-soft">
      {/*
        Day-fill SoftFail depth (BEA-323 / helpers BEA-400) + craft SoftFail
        query parity (BEA-408): azure sheet rail · SoftFailBadge Soft fill ·
        SoftFailSupport · softFailMistWash tip-011 — craft ?dayFillSoftFail=1.
        Yields stop drawer SoftFail (#225) ownership on Itinerary — never
        timber / Failed to fetch.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex w-full items-center justify-between gap-3 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-3.5 text-left shadow-[inset_3px_0_0_var(--bp-river)] transition duration-bp-fast ease-bp-out hover:bg-mist/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-inset"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
              {t(locale, "planner.dayFill.sheetEyebrow")}
            </span>
            <span className="font-display text-lg leading-snug tracking-tight text-ink">
              {t(locale, "planner.dayFill.title")}
            </span>
            {mode === "live" ? (
              <SoftFailLiveBadge>{badge}</SoftFailLiveBadge>
            ) : (
              <SoftFailBadge>{badge}</SoftFailBadge>
            )}
            {showSoftFail ? (
              <SoftFailBadge>
                {t(locale, "planner.dayFill.softBadge")}
              </SoftFailBadge>
            ) : null}
            <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
              {dayCountLabel}
            </span>
          </div>
          {showSoftFail ? (
            <SoftFailSupport className="mt-0.5 block">
              {sheetSupportCopy}
            </SoftFailSupport>
          ) : (
            <p className="mt-0.5 text-[11px] leading-snug text-ink-soft/80">
              {sheetSupportCopy}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 text-river transition duration-bp ease-bp-in-out ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      <SheetPresence
        open={open}
        style={{ animationDelay: "40ms" }}
        aria-label={t(locale, "planner.dayFill.title")}
      >
        {/* Compact SoftFail mist band under azure Day fill rail — stop drawer SoftFail (#225) stays on Itinerary. */}
        <SoftFailNotice
          open={showSoftFail}
          compact
          className="border-b border-[color:var(--bp-line)]"
        >
          {softCopy ?? ""}
        </SoftFailNotice>

        <div
          className={`animate-rise space-y-5 px-4 py-4 ${
            showSoftFail ? softFailMistWashClass : ""
          }`}
          style={{ animationDelay: "70ms" }}
        >
          <section
            className="animate-rise space-y-3"
            style={{ animationDelay: "50ms" }}
            aria-label={t(locale, "planner.dayFill.prefsEyebrow")}
          >
            <div>
              <SectionEyebrow>
                {t(locale, "planner.dayFill.prefsEyebrow")}
              </SectionEyebrow>
              <h3 className="mt-1 font-display text-base leading-snug tracking-tight text-ink">
                {t(locale, "planner.dayFill.prefsTitle")}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                {t(locale, "planner.dayFill.prefsSupport")}
              </p>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                {t(locale, "planner.dayFill.interests")}
              </div>
              <div
                className="flex flex-wrap gap-0.5 rounded-bp-sm bg-mist/50 p-1"
                role="group"
                aria-label={t(locale, "planner.dayFill.interests")}
              >
                {DAY_FILL_INTERESTS.map((id) => {
                  const on = interests.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleInterest(id)}
                      className={`rounded-bp-xs px-3 py-1.5 text-sm font-semibold bp-transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                        on
                          ? "animate-stop-select bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
                          : "text-ink-soft hover:bg-foam/70 hover:text-river"
                      }`}
                    >
                      {t(locale, INTEREST_KEYS[id])}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.dayFill.walk")}
                </span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={30}
                    max={150}
                    step={15}
                    value={walkMinutes}
                    onChange={(e) => setWalkMinutes(Number(e.target.value))}
                    className="w-full accent-[color:var(--bp-river)]"
                  />
                  <span className="shrink-0 tabular-nums text-sm text-ink">
                    {walkMinutes}
                    {t(locale, "planner.dayFill.minutes")}
                  </span>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.dayFill.days")}
                </span>
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={dayCount}
                  onChange={(e) =>
                    setDayCount(
                      Math.max(1, Math.min(7, Number(e.target.value) || 1)),
                    )
                  }
                  className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 transition duration-bp-fast ease-bp-out focus:ring-2 focus-visible:ring-focus/40"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                disabled={generating || interests.length === 0}
                onClick={() => void generate()}
                className="rounded-bp bg-river px-4 py-2.5 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generating
                  ? t(locale, "planner.dayFill.generating")
                  : t(locale, "planner.dayFill.generate")}
              </button>
              {proposal && (
                <button
                  type="button"
                  onClick={() => {
                    setProposal(null);
                    setLocalOnly(false);
                    if (softDemo) {
                      setNotice(t(locale, "planner.dayFill.softFail"));
                    } else if (status?.mode === "demo") {
                      setNotice(t(locale, "planner.dayFill.demoNotice"));
                    } else {
                      setNotice(null);
                    }
                  }}
                  className="rounded-bp-sm border border-[color:var(--bp-line)] px-3 py-2 text-sm text-ink-soft bp-transition hover:border-river/40 hover:text-river active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
                >
                  {t(locale, "planner.dayFill.discard")}
                </button>
              )}
            </div>
          </section>

          {generating && (
            <div
              role="status"
              aria-live="polite"
              className="animate-rise space-y-2"
              style={{ animationDelay: "60ms" }}
            >
              <DayFillSkeleton days={dayCount} />
              <p className="text-xs leading-snug text-ink-soft/80">
                {t(locale, "planner.dayFill.loadingHint")}
              </p>
            </div>
          )}

          {!proposal && !generating && (
            <div
              className="animate-rise max-w-sm space-y-1.5 px-0.5 py-3"
              style={{ animationDelay: "70ms" }}
              role="status"
              aria-live="polite"
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river/80">
                {t(locale, "planner.dayFill.emptyEyebrow")}
              </p>
              <p className="font-display text-lg font-semibold leading-snug tracking-tight text-ink">
                {t(locale, "planner.dayFill.empty")}
              </p>
              <p className="text-sm leading-relaxed text-ink-soft/80">
                {t(locale, "planner.dayFill.emptyHint")}
              </p>
            </div>
          )}

          {proposal && !generating && (
            <section
              className="animate-preview-in overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
              aria-label={t(locale, "planner.dayFill.preview")}
            >
              <div className="relative flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-3 shadow-[inset_3px_0_0_var(--bp-river)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SectionEyebrow>
                      {t(locale, "planner.dayFill.previewEyebrow")}
                    </SectionEyebrow>
                    {proposal.mode === "live" ? (
                      <SoftFailLiveBadge>
                        {t(locale, "planner.dayFill.liveBadge")}
                      </SoftFailLiveBadge>
                    ) : (
                      <SoftFailBadge>
                        {t(locale, "planner.dayFill.demoBadge")}
                      </SoftFailBadge>
                    )}
                  </div>
                  <h3 className="mt-1 font-display text-base leading-snug tracking-tight text-ink">
                    {t(locale, "planner.dayFill.preview")}
                  </h3>
                  {proposal.rationale && (
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                      {proposal.rationale}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={applying}
                  onClick={() => void apply()}
                  className="rounded-bp bg-river px-4 py-2.5 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-40"
                >
                  {applying
                    ? t(locale, "planner.dayFill.applying")
                    : t(locale, "planner.dayFill.apply")}
                </button>
              </div>

              <ol className="divide-y divide-[color:var(--bp-line)]">
                {proposal.days.map((day) => (
                  <li
                    key={day.dayIndex}
                    className="animate-rise px-3 py-3"
                    style={{
                      animationDelay: `${day.dayIndex * 55}ms`,
                    }}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-sm font-semibold leading-snug tracking-tight text-ink">
                        {t(locale, "planner.day")} {day.dayIndex + 1}
                        {day.date ? (
                          <span className="ml-2 text-sm font-normal text-ink-soft/80">
                            {day.date}
                          </span>
                        ) : null}
                      </span>
                      {day.note && (
                        <span className="inline-flex max-w-full items-center rounded-bp-xs bg-river/10 px-2 py-0.5 text-xs font-semibold text-river shadow-[inset_2px_0_0_var(--bp-river)]">
                          {day.note}
                        </span>
                      )}
                    </div>
                    <ol className="mt-2.5 space-y-2">
                      {day.stops.map((stop, i) => (
                        <li
                          key={`${stop.place.enginePlaceId}-${i}`}
                          className="flex gap-3 text-sm text-ink"
                        >
                          <span
                            className="animate-marker-pop mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-river/12 text-[11px] font-semibold text-river-deep"
                            style={{
                              animationDelay: `${day.dayIndex * 55 + i * 35}ms`,
                            }}
                          >
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate leading-snug">
                              {stop.place.name}
                            </div>
                            {typeof stop.estimatedWalkMinutes === "number" &&
                              stop.estimatedWalkMinutes > 0 && (
                                <div className="text-xs leading-snug text-ink-soft/80">
                                  {t(locale, "planner.dayFill.stopWalk")}{" "}
                                  {stop.estimatedWalkMinutes}
                                  {t(locale, "planner.dayFill.minutes")}
                                </div>
                              )}
                          </div>
                        </li>
                      ))}
                      {day.stops.length === 0 && (
                        <li className="text-xs leading-snug text-ink-soft/80">
                          {t(locale, "planner.dayFill.noStops")}
                        </li>
                      )}
                    </ol>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </SheetPresence>
    </div>
  );
}
