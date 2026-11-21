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
import { SoftFailNotice } from "@/components/soft-fail-notice";
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

/**
 * Planner secondary tool — smart day-fill sheet.
 * Lumen hierarchy: header · SoftFailNotice · prefs · preview.
 * Soft-fails to local Kyoto demo when LLM/API/Neon are absent.
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
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiGet<StatusResponse>("/v1/day-fill/status")
      .then((res) => {
        if (!cancelled) {
          setStatus({ mode: res.mode, provider: res.provider });
          if (res.mode === "demo") {
            setNotice(t(locale, "planner.dayFill.demoNotice"));
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ mode: "demo", provider: "demo-day-fill" });
          setNotice(t(locale, "planner.dayFill.demoNotice"));
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
        setStatus({ mode: "demo", provider: draft.provider });
        setNotice(
          isPlannerNoiseError(e)
            ? t(locale, "planner.dayFill.softFail")
            : t(locale, "planner.dayFill.demoNotice"),
        );
        onError("");
      } catch {
        if (isPlannerNoiseError(e)) {
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
  const softDemo = mode === "demo" || localOnly;
  const badge =
    mode === "live"
      ? t(locale, "planner.dayFill.liveBadge")
      : t(locale, "planner.dayFill.demoBadge");
  const softCopy =
    notice ??
    (softDemo ? t(locale, "planner.dayFill.demoNotice") : null);

  return (
    <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/55 shadow-bp-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition duration-bp-fast ease-bp-out hover:bg-mist/35"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg tracking-tight text-ink">
              {t(locale, "planner.dayFill.title")}
            </span>
            <span
              className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
                mode === "live"
                  ? "bg-river/12 text-river-deep"
                  : "bg-mist text-ink-soft"
              }`}
            >
              {badge}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            {t(locale, "planner.dayFill.support")}
          </p>
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
        className="space-y-5 border-t border-[color:var(--bp-line)] px-4 py-4"
        style={{ animationDelay: "40ms" }}
      >
          {softCopy ? <SoftFailNotice>{softCopy}</SoftFailNotice> : null}

          <section className="space-y-3" aria-label={t(locale, "planner.dayFill.interests")}>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                  {t(locale, "planner.dayFill.prefsEyebrow")}
                </p>
                <h3 className="mt-1 font-display text-base tracking-tight text-ink">
                  {t(locale, "planner.dayFill.prefsTitle")}
                </h3>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.dayFill.interests")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {DAY_FILL_INTERESTS.map((id) => {
                    const on = interests.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleInterest(id)}
                        className={`rounded-bp-sm px-3 py-1.5 text-sm transition duration-bp-fast ease-bp-out ${
                          on
                            ? "bg-river text-foam"
                            : "border border-[color:var(--bp-line)] bg-paper/70 text-ink-soft hover:border-river/40 hover:text-river"
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
                    className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 transition duration-bp-fast ease-bp-out focus:ring-2"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={generating || interests.length === 0}
                  onClick={() => void generate()}
                  className="rounded-bp bg-river px-4 py-2 text-sm font-semibold text-foam transition duration-bp ease-bp hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
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
                      if (status?.mode === "demo") {
                        setNotice(t(locale, "planner.dayFill.demoNotice"));
                      } else {
                        setNotice(null);
                      }
                    }}
                    className="rounded-bp-sm border border-[color:var(--bp-line)] px-3 py-2 text-sm text-ink-soft transition duration-bp-fast ease-bp-out hover:border-river/40 hover:text-river"
                  >
                    {t(locale, "planner.dayFill.discard")}
                  </button>
                )}
              </div>
            </section>

            {generating && (
              <div role="status" aria-live="polite" className="space-y-2">
                <DayFillSkeleton days={dayCount} />
                <p className="text-xs text-ink-soft">
                  {t(locale, "planner.dayFill.loadingHint")}
                </p>
              </div>
            )}

            {!proposal && !generating && (
              <div className="animate-fade max-w-sm px-0.5 py-4">
                <p className="font-display text-lg font-semibold tracking-tight text-ink">
                  {t(locale, "planner.dayFill.empty")}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                  {t(locale, "planner.dayFill.emptyHint")}
                </p>
              </div>
            )}

            {proposal && !generating && (
              <section
                className="animate-preview-in overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam"
                aria-label={t(locale, "planner.dayFill.preview")}
              >
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                        {t(locale, "planner.dayFill.preview")}
                      </span>
                      <span
                        className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
                          proposal.mode === "live"
                            ? "bg-river/12 text-river-deep"
                            : "bg-mist text-ink-soft"
                        }`}
                      >
                        {proposal.mode === "live"
                          ? t(locale, "planner.dayFill.liveBadge")
                          : t(locale, "planner.dayFill.demoBadge")}
                      </span>
                    </div>
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
                    className="rounded-bp bg-river px-4 py-2 text-sm font-semibold text-foam transition duration-bp ease-bp-out-strong hover:bg-river-deep disabled:opacity-40"
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
                        <span className="font-display text-sm font-semibold tracking-tight text-ink">
                          {t(locale, "planner.day")} {day.dayIndex + 1}
                          {day.date ? (
                            <span className="ml-2 text-sm font-normal text-ink-soft">
                              {day.date}
                            </span>
                          ) : null}
                        </span>
                        {day.note && (
                          <span className="text-xs text-river">{day.note}</span>
                        )}
                      </div>
                      <ol className="mt-2.5 space-y-2">
                        {day.stops.map((stop, i) => (
                          <li
                            key={`${stop.place.enginePlaceId}-${i}`}
                            className="flex gap-2.5 text-sm text-ink"
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
                              <div className="truncate">{stop.place.name}</div>
                              {typeof stop.estimatedWalkMinutes === "number" &&
                                stop.estimatedWalkMinutes > 0 && (
                                  <div className="text-xs text-ink-soft">
                                    {t(locale, "planner.dayFill.stopWalk")}{" "}
                                    {stop.estimatedWalkMinutes}
                                    {t(locale, "planner.dayFill.minutes")}
                                  </div>
                                )}
                            </div>
                          </li>
                        ))}
                        {day.stops.length === 0 && (
                          <li className="text-xs text-ink-soft">
                            {t(locale, "planner.dayFill.noStops")}
                          </li>
                        )}
                      </ol>
                    </li>
                  ))}
                </ol>
              </section>
            )}
      </SheetPresence>
    </div>
  );
}
