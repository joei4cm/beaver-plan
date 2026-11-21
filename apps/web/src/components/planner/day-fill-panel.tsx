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
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
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
        if (!cancelled) setStatus({ mode: res.mode, provider: res.provider });
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
  const badge =
    mode === "live"
      ? t(locale, "planner.dayFill.liveBadge")
      : t(locale, "planner.dayFill.demoBadge");

  return (
    <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-mist/35"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg tracking-tight text-ink">
              {t(locale, "planner.dayFill.title")}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${
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
          className={`shrink-0 text-river transition duration-bp ease-bp ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          className="animate-sheet-in space-y-4 border-t border-[color:var(--bp-line)] px-4 py-4"
          style={{ animationDelay: "40ms" }}
        >
          {notice && (
            <p
              className="rounded-md bg-mist/60 px-3 py-2 text-xs leading-relaxed text-ink-soft"
              role="status"
            >
              {notice}
            </p>
          )}

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
                    className={`rounded-md px-3 py-1.5 text-sm transition duration-bp-fast ease-bp ${
                      on
                        ? "bg-river text-foam"
                        : "border border-[color:var(--bp-line)] bg-paper/70 text-ink-soft hover:border-river/40 hover:text-river"
                    }`}
                  >
                    {t(locale, `planner.dayFill.interest.${id}`)}
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
                className="w-full rounded-md border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 focus:ring-2"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={generating || interests.length === 0}
              onClick={() => void generate()}
              className="rounded-bp bg-river px-4 py-2 text-sm font-semibold text-foam transition hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
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
                  setNotice(null);
                }}
                className="rounded-md border border-[color:var(--bp-line)] px-3 py-2 text-sm text-ink-soft transition hover:border-river/40 hover:text-river"
              >
                {t(locale, "planner.dayFill.discard")}
              </button>
            )}
          </div>

          {generating && (
            <div
              className="animate-fade space-y-3 rounded-md border border-dashed border-river/25 bg-paper/40 px-3 py-4"
              role="status"
              aria-live="polite"
            >
              <div className="h-3 w-40 animate-pulse rounded bg-mist" />
              <div className="space-y-2">
                <div className="h-16 animate-pulse rounded-md bg-mist/80" />
                <div className="h-16 animate-pulse rounded-md bg-mist/60" />
                <div className="h-16 animate-pulse rounded-md bg-mist/40" />
              </div>
              <p className="text-xs text-ink-soft">
                {t(locale, "planner.dayFill.loadingHint")}
              </p>
            </div>
          )}

          {!proposal && !generating && (
            <div className="animate-fade rounded-md border border-dashed border-[color:var(--bp-line)] bg-paper/35 px-4 py-6 text-center">
              <p className="text-sm text-ink">{t(locale, "planner.dayFill.empty")}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {t(locale, "planner.dayFill.emptyHint")}
              </p>
            </div>
          )}

          {proposal && !generating && (
            <div className="animate-rise space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                    {t(locale, "planner.dayFill.preview")}
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
                  className="rounded-bp bg-river px-4 py-2 text-sm font-semibold text-foam transition hover:bg-river-deep disabled:opacity-40"
                >
                  {applying
                    ? t(locale, "planner.dayFill.applying")
                    : t(locale, "planner.dayFill.apply")}
                </button>
              </div>

              <ol className="space-y-3">
                {proposal.days.map((day) => (
                  <li
                    key={day.dayIndex}
                    className="animate-fade rounded-md border border-[color:var(--bp-line)]/80 bg-paper/55 px-3 py-3"
                    style={{ animationDelay: `${day.dayIndex * 40}ms` }}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-ink">
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
                    <ol className="mt-2 space-y-1.5">
                      {day.stops.map((stop, i) => (
                        <li
                          key={`${stop.place.enginePlaceId}-${i}`}
                          className="flex gap-2 text-sm text-ink"
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-river/12 text-[11px] font-semibold text-river-deep">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
