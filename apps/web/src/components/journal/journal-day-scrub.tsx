"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Stop } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";

type Props = {
  locale: Locale;
  stops: Stop[];
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  /**
   * SoftFailNotice depth (BEA-368 after #103):
   * SoftFail under azure scrub rail · Soft badge · softSupport · tip-011 mist-wash.
   * Sibling rail — compose SoftFail (#264) / empty SoftFail (#231) / photo strip
   * SoftFail (#244) stay on their rails (no double SoftFail on scrub).
   */
  softOpen?: boolean;
};

/**
 * Journal day timeline scrub — Lumen Route azure thumb/track under day tabs.
 * SoftFailNotice depth (BEA-368 after #103): SoftFail under azure rail · Soft badge ·
 * softSupport · tip-011 mist-wash. Soft copy never timber / Failed to fetch.
 * Same craft as planner #86: tip 011 (#46) settle, overshoot press, keyboard slider.
 */
export function JournalDayScrub({
  locale,
  stops,
  selectedStopId,
  onSelectStop,
  softOpen = false,
}: Props) {
  const labelId = useId();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [liveIndex, setLiveIndex] = useState(0);

  const selectedIndex = useMemo(() => {
    if (!stops.length) return 0;
    if (!selectedStopId) return 0;
    const idx = stops.findIndex((s) => s.id === selectedStopId);
    return idx >= 0 ? idx : 0;
  }, [stops, selectedStopId]);

  const hasSelection = Boolean(
    selectedStopId && stops.some((s) => s.id === selectedStopId),
  );

  useEffect(() => {
    if (!dragging) setLiveIndex(selectedIndex);
  }, [dragging, selectedIndex]);

  const index = dragging ? liveIndex : selectedIndex;
  const max = Math.max(stops.length - 1, 0);
  const pct =
    !hasSelection && !dragging ? 0 : max === 0 ? 0 : (index / max) * 100;
  const active = stops[index] ?? null;

  const indexFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || stops.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const ratio = rect.width === 0 ? 0 : x / rect.width;
      return Math.round(ratio * max);
    },
    [max, stops.length],
  );

  const commitIndex = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), max);
      setLiveIndex(clamped);
      const stop = stops[clamped];
      if (stop) onSelectStop(stop.id);
    },
    [max, onSelectStop, stops],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!stops.length) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    commitIndex(indexFromClientX(e.clientX));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    commitIndex(indexFromClientX(e.clientX));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!stops.length) return;
    let next = hasSelection || dragging ? index : 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = Math.min(next + 1, max);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = Math.max(next - 1, 0);
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = max;
    } else if (e.key === "PageUp") {
      next = Math.max(next - 2, 0);
    } else if (e.key === "PageDown") {
      next = Math.min(next + 2, max);
    } else {
      return;
    }
    e.preventDefault();
    commitIndex(next);
  };

  if (stops.length === 0) return null;

  /** While dragging, snap without lag; settle uses CSS tip-011 curves. */
  const liveTransition = dragging ? "none" : undefined;
  const softSupportCopy = softOpen
    ? t(locale, "journal.scrub.softSupport")
    : null;
  const softCopy = t(locale, "journal.scrub.softFail");

  return (
    <div
      className={`bp-day-scrub border-b border-[color:var(--bp-line)] ${
        softOpen
          ? "bg-mist/35 shadow-[inset_3px_0_0_var(--bp-river)]"
          : "bg-paper/50"
      }`}
    >
      {/*
        SoftFail depth (BEA-368 after #103):
        azure scrub rail · Soft scrub badge · softSupport · compact SoftFail
        mist band (`border-b`) · tip-011 mist-wash track — compose SoftFail
        (#264) / empty SoftFail (#231) / photo strip SoftFail (#244) stay on
        their rails (sibling SoftFail; no double SoftFail on scrub) — never
        timber / Failed to fetch.
      */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 px-4 pt-3 pb-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p
            id={labelId}
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river"
          >
            {t(locale, "journal.scrub.label")}
          </p>
          {softSupportCopy ? (
            <p className="min-w-0 text-[11px] leading-snug text-ink-soft/80">
              {softSupportCopy}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5">
          {softOpen ? (
            <span className="rounded-bp-xs bg-mist px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft bp-transition">
              {t(locale, "journal.scrub.softBadge")}
            </span>
          ) : null}
          <p className="min-w-0 truncate text-sm font-semibold text-ink tabular-nums">
            {hasSelection || dragging ? (
              <>
                <span className="text-river">{index + 1}</span>
                <span className="text-ink-soft"> / {stops.length}</span>
                {active ? (
                  <span className="ml-2 font-medium text-ink-soft">
                    {active.place.name}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-ink-soft">— / {stops.length}</span>
            )}
          </p>
        </div>
      </header>

      {/* Compact SoftFail mist band under azure scrub rail — sibling SoftFails stay on compose / empty / photo strip rails. */}
      <SoftFailNotice
        open={softOpen}
        compact
        className="border-b border-[color:var(--bp-line)]"
      >
        {softCopy}
      </SoftFailNotice>

      <div
        className={`px-4 pb-3 pt-2 ${
          softOpen
            ? "bg-gradient-to-b from-mist/25 via-mist/10 to-transparent"
            : ""
        }`}
      >
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={index}
          aria-valuetext={
            active
              ? t(locale, "journal.scrub.value")
                  .replace("{n}", String(index + 1))
                  .replace("{total}", String(stops.length))
                  .replace("{name}", active.place.name)
              : undefined
          }
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`bp-day-scrub__rail relative h-10 cursor-pointer touch-none select-none outline-none ${
            dragging ? "bp-day-scrub__rail--active" : ""
          } ${
            softOpen
              ? "rounded-bp-sm bg-mist/50 px-1 shadow-[inset_3px_0_0_var(--bp-river)]"
              : ""
          }`}
        >
          <span aria-hidden className="bp-day-scrub__track" />
          <span
            aria-hidden
            className="bp-day-scrub__fill"
            style={{
              width: `${pct}%`,
              transition: liveTransition,
            }}
          />
          {stops.map((stop, i) => {
            const tickPct = max === 0 ? 0 : (i / max) * 100;
            const on = (hasSelection || dragging) && i <= index;
            const current = (hasSelection || dragging) && i === index;
            return (
              <button
                key={stop.id}
                type="button"
                tabIndex={-1}
                aria-label={t(locale, "journal.scrub.tick")
                  .replace("{n}", String(i + 1))
                  .replace("{name}", stop.place.name)}
                className={`bp-day-scrub__tick ${
                  on ? "bp-day-scrub__tick--on" : ""
                } ${current ? "bp-day-scrub__tick--current" : ""}`}
                style={{ left: `${tickPct}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  commitIndex(i);
                }}
              />
            );
          })}
          <span
            aria-hidden
            className={`bp-day-scrub__thumb ${
              dragging ? "bp-day-scrub__thumb--active" : ""
            }`}
            style={{
              left: `${pct}%`,
              transition: liveTransition,
            }}
          />
        </div>
      </div>
    </div>
  );
}
