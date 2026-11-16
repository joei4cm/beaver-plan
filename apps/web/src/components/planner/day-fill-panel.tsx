"use client";

import { useState } from "react";
import {
  DAY_FILL_INTERESTS,
  type DayFillInterest,
  type DayFillProposal,
  type Trip,
} from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { apiSend } from "@/lib/api";

type Props = {
  tripId: string;
  locale: Locale;
  trip: Trip;
  dayCountHint: number;
  onApplied: () => Promise<void>;
  onError: (message: string) => void;
};

const DEFAULT_INTERESTS: DayFillInterest[] = ["temples", "food", "culture"];

export function DayFillPanel({
  tripId,
  locale,
  trip,
  dayCountHint,
  onApplied,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [interests, setInterests] = useState<DayFillInterest[]>(DEFAULT_INTERESTS);
  const [walkMinutes, setWalkMinutes] = useState(60);
  const [dayCount, setDayCount] = useState(
    Math.max(1, Math.min(7, dayCountHint || 3)),
  );
  const [proposal, setProposal] = useState<DayFillProposal | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);

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
    } catch (e) {
      onError(e instanceof Error ? e.message : "day_fill_failed");
    } finally {
      setGenerating(false);
    }
  }

  async function apply() {
    if (!proposal) return;
    setApplying(true);
    onError("");
    try {
      await apiSend(`/v1/trips/${tripId}/day-fill/apply`, "POST", {
        proposal,
        expectedVersion: trip.version,
      });
      setProposal(null);
      await onApplied();
    } catch (e) {
      onError(e instanceof Error ? e.message : "apply_failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--bp-line)] bg-foam/55">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-mist/35"
        aria-expanded={open}
      >
        <div>
          <div className="font-display text-lg tracking-tight text-ink">
            {t(locale, "planner.dayFill.title")}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            {t(locale, "planner.dayFill.support")}
          </p>
        </div>
        <span
          className={`text-river transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          className="animate-fade space-y-4 border-t border-[color:var(--bp-line)] px-4 py-4"
          style={{ animationDelay: "40ms" }}
        >
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-ink-soft">
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
                    className={`rounded-md px-3 py-1.5 text-sm transition ${
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
              <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-ink-soft">
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
                  className="w-full accent-[color:var(--bp-river,#1f6b5c)]"
                />
                <span className="shrink-0 tabular-nums text-sm text-ink">
                  {walkMinutes}
                  {t(locale, "planner.dayFill.minutes")}
                </span>
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-ink-soft">
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
              className="rounded-md bg-timber px-4 py-2 text-sm font-medium text-foam transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating
                ? t(locale, "planner.dayFill.generating")
                : t(locale, "planner.dayFill.generate")}
            </button>
            {proposal && (
              <>
                <span
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    proposal.mode === "live"
                      ? "bg-river/15 text-river-deep"
                      : "bg-mist/80 text-ink-soft"
                  }`}
                >
                  {proposal.mode === "live"
                    ? t(locale, "planner.dayFill.liveBadge")
                    : t(locale, "planner.dayFill.demoBadge")}
                </span>
                <button
                  type="button"
                  onClick={() => setProposal(null)}
                  className="rounded-md border border-[color:var(--bp-line)] px-3 py-2 text-sm text-ink-soft transition hover:border-river/40 hover:text-river"
                >
                  {t(locale, "planner.dayFill.discard")}
                </button>
              </>
            )}
          </div>

          {!proposal && (
            <p className="text-sm text-ink-soft">
              {t(locale, "planner.dayFill.empty")}
            </p>
          )}

          {proposal && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
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
                  className="rounded-md bg-river px-4 py-2 text-sm font-medium text-foam transition hover:brightness-110 disabled:opacity-40"
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
                    className="rounded-md border border-[color:var(--bp-line)]/80 bg-paper/50 px-3 py-3"
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
