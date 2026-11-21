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

type Props = {
  locale: Locale;
  stops: Stop[];
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
};

/**
 * Journal day timeline scrub — Lumen Route azure thumb/track under day tabs.
 * Same craft as planner #86: tip 011 (#46) settle, overshoot press, keyboard slider.
 */
export function JournalDayScrub({
  locale,
  stops,
  selectedStopId,
  onSelectStop,
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

  return (
    <div className="bp-day-scrub border-b border-[color:var(--bp-line)] bg-paper/50 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p
          id={labelId}
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft"
        >
          {t(locale, "journal.scrub.label")}
        </p>
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
  );
}
