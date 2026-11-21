"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { PlaceSummary } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";

export type MapLayerFlags = {
  routes: boolean;
  stops: boolean;
  legend: boolean;
};

type Props = {
  locale: Locale;
  engineLabel: string;
  modeLabel: string;
  tileLabel: string;
  /** Soft-fail when Directions/Places live keys or vendor JS map API are absent. */
  softFail: boolean;
  softFailMessage?: string | null;
  /** Places search is demo / API-absent — badge + SoftFailNotice in results sheet. */
  searchDemo?: boolean;
  query: string;
  results: PlaceSummary[];
  searching: boolean;
  onQueryChange: (value: string) => void;
  onSearchCommit: (value: string) => void;
  onPickPlace: (place: PlaceSummary) => void;
  layers: MapLayerFlags;
  onLayersChange: (next: MapLayerFlags) => void;
  onLocate: () => void;
  onLocateSoftFail: (message: string) => void;
  hasRoute: boolean;
};

/**
 * Komoot-style floating map chrome — thin rail, not a card stack.
 * Hierarchy: engine chip (identity) → search (primary tool) → layers/locate rail.
 * Search results: tip-009 popover + SheetPresence in/out, azure keyboard select.
 */
export function MapChrome({
  locale,
  engineLabel,
  modeLabel,
  tileLabel,
  softFail,
  softFailMessage,
  searchDemo = false,
  query,
  results,
  searching,
  onQueryChange,
  onSearchCommit,
  onPickPlace,
  layers,
  onLayersChange,
  onLocate,
  onLocateSoftFail,
  hasRoute,
}: Props) {
  const searchId = useId();
  const listboxId = useId();
  const layersId = useId();
  const [layersOpen, setLayersOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const layersRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const q = query.trim();
  const hasResults = results.length > 0;
  const showEmpty = q.length > 0 && !searching && !hasResults;
  const sheetOpen = q.length > 0 && (hasResults || showEmpty || searching);

  useEffect(() => {
    setActiveIndex(0);
  }, [results, q]);

  useEffect(() => {
    if (!layersOpen) return;
    function onDoc(e: MouseEvent) {
      if (!layersRef.current?.contains(e.target as Node)) {
        setLayersOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [layersOpen]);

  useEffect(() => {
    if (!hasResults) return;
    optionRefs.current[activeIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, hasResults]);

  function handleLocate() {
    if (hasRoute) {
      onLocate();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onLocateSoftFail(t(locale, "planner.map.locateSoftFail"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        // No stop geometry to center on — soft-fail rather than a blank pan.
        onLocateSoftFail(t(locale, "planner.map.locateSoftFail"));
      },
      () => onLocateSoftFail(t(locale, "planner.map.locateSoftFail")),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60_000 },
    );
  }

  function pickActive() {
    const place = results[activeIndex];
    if (place) onPickPlace(place);
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (hasResults) {
        pickActive();
      } else {
        onSearchCommit(query);
      }
      return;
    }
    if (e.key === "Escape") {
      if (sheetOpen) {
        e.preventDefault();
        onQueryChange("");
        onSearchCommit("");
      }
      return;
    }
    if (!hasResults) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
  }

  const notice =
    softFailMessage?.trim() ||
    (softFail ? t(locale, "planner.map.softFail") : null);

  const activeOptionId = hasResults
    ? `${listboxId}-opt-${activeIndex}`
    : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2]">
      {/* Top row: engine identity + search */}
      <div className="absolute left-3 right-3 top-3 flex items-start gap-2 sm:left-4 sm:right-4 sm:top-4 sm:gap-3">
        <div className="pointer-events-auto flex min-w-0 shrink-0 flex-col gap-1">
          <span className="inline-flex w-fit items-center rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink shadow-bp-soft backdrop-blur">
            {engineLabel}
          </span>
          <span className="px-0.5 text-[11px] font-medium text-ink-soft">
            {modeLabel}
            <span className="mx-1 text-ink-soft/40" aria-hidden>
              ·
            </span>
            {tileLabel}
          </span>
        </div>

        <div
          ref={searchWrapRef}
          className="pointer-events-auto relative min-w-0 flex-1 sm:max-w-sm sm:flex-none sm:basis-[min(100%,20rem)]"
        >
          <label className="sr-only" htmlFor={searchId}>
            {t(locale, "planner.search")}
          </label>
          <div className="flex items-center gap-2 rounded-bp border border-[color:var(--bp-line)] bg-foam/95 px-3 shadow-bp-soft backdrop-blur transition duration-bp-fast ease-bp-out focus-within:border-river/50 focus-within:ring-2 focus-within:ring-focus/35">
            <SearchGlyph className="shrink-0 text-ink-soft" />
            <input
              id={searchId}
              data-bp-place-search
              role="combobox"
              aria-expanded={sheetOpen}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onCompositionEnd={(e) => onSearchCommit(e.currentTarget.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={t(locale, "planner.searchPlaceholder")}
              className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm text-ink outline-none ring-0 placeholder:text-ink-soft/45"
              autoComplete="off"
            />
            {searching ? (
              <span className="shrink-0 text-xs text-ink-soft" aria-hidden>
                …
              </span>
            ) : null}
          </div>

          <SheetPresence
            open={sheetOpen}
            variant="popover"
            className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                  {t(locale, "planner.search.eyebrow")}
                </span>
                {hasResults ? (
                  <span className="text-[11px] font-medium text-ink-soft/80">
                    {t(locale, "planner.search.resultsCount").replace(
                      "{n}",
                      String(results.length),
                    )}
                  </span>
                ) : null}
              </div>
              <span
                className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
                  searchDemo
                    ? "bg-mist text-ink-soft"
                    : "bg-river/12 text-river-deep"
                }`}
              >
                {searchDemo
                  ? t(locale, "planner.search.demoBadge")
                  : t(locale, "planner.search.liveBadge")}
              </span>
            </div>

            {hasResults ? (
              <ul
                id={listboxId}
                role="listbox"
                aria-label={t(locale, "planner.search.eyebrow")}
                className="max-h-64 overflow-auto py-1"
              >
                {results.map((place, i) => {
                  const selected = i === activeIndex;
                  const optionId = `${listboxId}-opt-${i}`;
                  return (
                    <li key={place.enginePlaceId} role="presentation">
                      <button
                        ref={(el) => {
                          optionRefs.current[i] = el;
                        }}
                        id={optionId}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => onPickPlace(place)}
                        className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition duration-bp-fast ease-bp-out ${
                          selected
                            ? "bg-river/10 shadow-[inset_3px_0_0_var(--bp-river)]"
                            : "hover:bg-mist/50"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums transition duration-bp-fast ease-bp-out ${
                            selected
                              ? "bg-river text-foam shadow-bp-soft"
                              : "bg-mist text-ink-soft"
                          }`}
                          aria-hidden
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="block font-display text-sm font-semibold leading-snug tracking-tight text-ink">
                            {place.name}
                          </span>
                          {place.address ? (
                            <span className="block text-xs leading-relaxed text-ink-soft">
                              {place.address}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] transition duration-bp-fast ease-bp-out ${
                            selected ? "text-river" : "text-ink-soft/50"
                          }`}
                        >
                          {t(locale, "planner.search.addHint")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : showEmpty ? (
              <div className="animate-fade space-y-1.5 px-3.5 py-4">
                <p className="font-display text-sm font-semibold tracking-tight text-ink">
                  {t(locale, "planner.search.emptyTitle")}
                </p>
                <p className="text-xs leading-relaxed text-ink-soft">
                  {t(locale, "planner.search.emptyHint")}
                </p>
              </div>
            ) : (
              <div className="px-3.5 py-3 text-xs text-ink-soft" aria-busy>
                {t(locale, "planner.search")}
                …
              </div>
            )}

            {searchDemo && hasResults ? (
              <SoftFailNotice compact>
                {t(locale, "planner.searchDemo")}
              </SoftFailNotice>
            ) : null}
            {searchDemo && showEmpty ? (
              <SoftFailNotice compact>
                {t(locale, "planner.search.softFailEmpty")}
              </SoftFailNotice>
            ) : null}
          </SheetPresence>
        </div>

        {/* Tool rail — layers + locate */}
        <div
          ref={layersRef}
          className="pointer-events-auto relative ml-auto flex shrink-0 flex-col gap-1.5"
        >
          <div className="flex overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft backdrop-blur">
            <button
              type="button"
              aria-expanded={layersOpen}
              aria-controls={layersId}
              aria-label={t(locale, "planner.map.layers")}
              onClick={() => setLayersOpen((o) => !o)}
              className={`bp-transition flex h-10 w-10 items-center justify-center text-ink-soft hover:bg-mist/70 hover:text-ink ${
                layersOpen ? "bg-mist/80 text-river" : ""
              }`}
            >
              <LayersGlyph />
            </button>
            <span
              className="w-px self-stretch bg-[color:var(--bp-line)]"
              aria-hidden
            />
            <button
              type="button"
              aria-label={t(locale, "planner.map.locate")}
              onClick={handleLocate}
              className="bp-transition flex h-10 w-10 items-center justify-center text-ink-soft hover:bg-mist/70 hover:text-ink"
            >
              <LocateGlyph />
            </button>
          </div>

          <SheetPresence
            open={layersOpen}
            id={layersId}
            role="group"
            variant="popover"
            aria-label={t(locale, "planner.map.layers")}
            className="absolute right-0 top-[calc(100%+6px)] z-20 w-44 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp"
          >
            <p className="border-b border-[color:var(--bp-line)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              {t(locale, "planner.map.layers")}
            </p>
            {(
              [
                ["routes", "planner.map.layer.routes"],
                ["stops", "planner.map.layer.stops"],
                ["legend", "planner.map.layer.legend"],
              ] as const
            ).map(([key, labelKey]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm text-ink transition duration-bp-fast ease-bp-out hover:bg-mist/50"
              >
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={(e) =>
                    onLayersChange({ ...layers, [key]: e.target.checked })
                  }
                  className="accent-[color:var(--bp-river)]"
                />
                {t(locale, labelKey)}
              </label>
            ))}
          </SheetPresence>
        </div>
      </div>

      {/* Bottom-left stack: SoftFailNotice + transfer legend (clears Leaflet zoom) */}
      <div className="absolute bottom-4 left-3 z-[2] flex max-w-[min(100%-5rem,22rem)] flex-col gap-2 sm:left-4">
        {notice ? (
          <div className="pointer-events-auto">
            <SoftFailNotice className="shadow-bp-soft backdrop-blur">
              {notice}
            </SoftFailNotice>
          </div>
        ) : null}
        {layers.legend && hasRoute ? (
          <div className="pointer-events-none flex flex-wrap items-center gap-3 rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft shadow-bp-soft backdrop-blur">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 border-t-2 border-dashed border-ink-soft"
                aria-hidden
              />
              {t(locale, "planner.transfer.walk")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded-full bg-river"
                aria-hidden
              />
              {t(locale, "planner.transfer.ride")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 border-t-2 border-dashed border-river/70"
                aria-hidden
              />
              {t(locale, "planner.transfer.change")}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className}
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5 13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LayersGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 3.5 15 7l-6 3.5L3 7l6-3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M3 10.2 9 13.7l6-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 13.2 9 16.7l6-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LocateGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9 2.5v2M9 13.5v2M2.5 9h2M13.5 9h2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
