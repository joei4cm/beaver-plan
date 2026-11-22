"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { PlaceSummary, Trip } from "@beaver/core";
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

export type MapLayerFlags = {
  routes: boolean;
  stops: boolean;
  legend: boolean;
};

const ENGINE_OPTS: Trip["mapEngine"][] = ["auto", "google", "amap", "baidu"];

type Props = {
  locale: Locale;
  engineLabel: string;
  modeLabel: string;
  tileLabel: string;
  /** Trip map-engine preference (auto / vendor lock). */
  preference: Trip["mapEngine"];
  onPreferenceChange: (next: Trip["mapEngine"]) => void;
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
 * SoftFail depth kept (BEA-318 / BEA-390 / BEA-414 / BEA-422) + wave 49 craft
 * residual (BEA-473): Lumen eyebrow tracking · tip-011 press settle · river/foam
 * token insets (no hardcoded rgba). SoftFailBadge · SoftFailSupport · compact
 * SoftFail mist band · tip-011 mist-wash unchanged. Craft SoftFail:
 * `/trips/…?searchSoftFail=1` · `?mapSoftFail=1` · `?legendSoftFail=1`. Yields
 * between Places / Map / Transfer / basemap (no double SoftFail). Soft copy
 * never timber / Failed to fetch. No `/dev` gallery.
 */
export function MapChrome({
  locale,
  engineLabel,
  modeLabel,
  tileLabel,
  preference,
  onPreferenceChange,
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
  const engineId = useId();
  const [layersOpen, setLayersOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const layersRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /** Craft preview: /trips/…?searchSoftFail=1 — SoftFail depth under Places. */
  const [searchSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("searchSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…?mapSoftFail=1 — SoftFail depth under floating Map. */
  const [mapSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("mapSoftFail") === "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…?legendSoftFail=1 — SoftFail depth under Transfer. */
  const [legendSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("legendSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });

  const q = query.trim();
  const hasResults = results.length > 0;
  const showEmpty = q.length > 0 && !searching && !hasResults;
  const sheetOpen = q.length > 0 && (hasResults || showEmpty || searching);

  useEffect(() => {
    setActiveIndex(0);
  }, [results, q]);

  // Search sheet owns the stage — fold secondary popovers while querying.
  useEffect(() => {
    if (q.length === 0) return;
    setEngineOpen(false);
    setLayersOpen(false);
  }, [q]);

  useEffect(() => {
    if (!layersOpen && !engineOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (layersOpen && !layersRef.current?.contains(target)) {
        setLayersOpen(false);
      }
      if (engineOpen && !engineRef.current?.contains(target)) {
        setEngineOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [layersOpen, engineOpen]);

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

  const locateNotice = softFailMessage?.trim() || null;
  const legendOpen = layers.legend && hasRoute;
  /**
   * Search SoftFailNotice depth (BEA-302 after #179) + SoftFail helpers
   * (BEA-390) + craft SoftFail query parity (BEA-422): azure Places rail ·
   * SoftFailBadge / Live · SoftFailSupport · compact SoftFail (border-b) ·
   * mist-wash tip-011 body. Craft: /trips/…?searchSoftFail=1 forces SoftFail
   * under Places when the sheet is open. Stage + transfer legend yield (no
   * double depth). Soft copy never timber / Failed to fetch.
   */
  const searchOwnsSoftFail = (searchDemo || searchSoftPreview) && sheetOpen;
  const searchSoftCopy = showEmpty
    ? t(locale, "planner.search.softFailEmpty")
    : t(locale, "planner.search.softFail");
  /**
   * Floating SoftFailNotice depth (BEA-318 after #213; yield audit BEA-414) +
   * craft SoftFail query parity (BEA-422): locate + vendor soft-fail share one
   * SoftFail unit. Craft: /trips/…?mapSoftFail=1 · /trips/…?legendSoftFail=1.
   * Yields while basemap SoftFail / search SoftFail (#226) / legend SoftFail
   * (#266) SoftFail chrome own — locate SoftFail must not bypass SoftFail Soft
   * ownership (no double SoftFail depth). Soft copy never timber / Failed to
   * fetch.
   */
  const legendSoft = softFail || legendSoftPreview;
  const legendOwnsSoftFail = legendOpen && legendSoft && !searchOwnsSoftFail;
  const basemapOwnsSoftFail = engineOpen && softFail;
  const floatingOwnsSoft =
    !searchOwnsSoftFail &&
    !legendOwnsSoftFail &&
    !basemapOwnsSoftFail &&
    (Boolean(locateNotice) || softFail || mapSoftPreview);
  const floatingSoftCopy =
    locateNotice ||
    (floatingOwnsSoft ? t(locale, "planner.map.softFail") : null);

  const layersActive = (["routes", "stops", "legend"] as const).filter(
    (key) => layers[key],
  ).length;
  const layersActiveLabel = t(locale, "planner.map.layersActiveCount").replace(
    "{n}",
    String(layersActive),
  );

  const activeOptionId = hasResults
    ? `${listboxId}-opt-${activeIndex}`
    : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2]">
      {/* Top row: basemap identity · search (primary) · tool rail */}
      <div className="absolute left-3 right-3 top-3 flex items-start gap-2 sm:left-4 sm:right-4 sm:top-4 sm:gap-3">
        <div
          ref={engineRef}
          className="animate-rise pointer-events-auto relative flex min-w-0 shrink-0 flex-col gap-1"
          style={{ animationDelay: "40ms" }}
        >
          <button
            type="button"
            aria-expanded={engineOpen}
            aria-controls={engineId}
            aria-label={t(locale, "planner.map.engineControl")}
            onClick={() => {
              setEngineOpen((o) => !o);
              setLayersOpen(false);
            }}
            className={`inline-flex w-fit max-w-[11rem] items-center gap-1.5 rounded-bp-sm border bg-foam/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] shadow-bp-soft backdrop-blur-md transition duration-bp ease-bp-out-strong active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 ${
              engineOpen
                ? "border-river/45 text-river shadow-bp ring-2 ring-river/25"
                : "border-[color:var(--bp-line)] text-ink hover:border-river/35 hover:text-river"
            }`}
          >
            <span className="truncate">{engineLabel}</span>
            <EngineCaret open={engineOpen} />
          </button>
          <span className="px-0.5 text-[11px] font-medium leading-relaxed text-ink-soft/90 drop-shadow-[0_1px_0_color-mix(in_srgb,var(--bp-foam)_65%,transparent)]">
            {modeLabel}
            <span className="mx-1 text-ink-soft/40" aria-hidden>
              ·
            </span>
            {tileLabel}
          </span>

          <SheetPresence
            open={engineOpen}
            id={engineId}
            role="group"
            variant="popover"
            aria-label={t(locale, "planner.map.engineControl")}
            className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(100vw-1.5rem,17.5rem)] overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp"
          >
            <header
              className="animate-rise relative border-b border-[color:var(--bp-line)] bg-paper/80 px-3 py-2.5 pl-3.5 shadow-[inset_3px_0_0_var(--bp-river)]"
              style={{ animationDelay: "40ms" }}
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                {t(locale, "planner.map.basemapEyebrow")}
              </p>
              <p className="mt-1 font-display text-sm font-semibold tracking-tight text-ink">
                {t(locale, "planner.map.basemapTitle")}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                {t(locale, "planner.map.basemapSupport")}
              </p>
            </header>

            <div
              className="animate-rise flex flex-col gap-2 px-3 py-3"
              style={{ animationDelay: "70ms" }}
              role="group"
              aria-label={t(locale, "planner.map.basemapTitle")}
            >
              <div className="inline-flex w-full gap-0.5 rounded-bp-sm bg-mist/50 p-1">
                {ENGINE_OPTS.map((opt) => {
                  const active = preference === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onPreferenceChange(opt)}
                      className={`min-w-0 flex-1 rounded-bp-xs px-1.5 py-1.5 text-[11px] font-semibold transition duration-bp-fast ease-bp-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                        active
                          ? "animate-stop-select bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
                          : "text-ink-soft hover:bg-foam/70 hover:text-river"
                      }`}
                    >
                      {t(locale, `planner.pref.${opt}` as MessageKey)}
                    </button>
                  );
                })}
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-soft">
                <span className="font-medium text-ink">{engineLabel}</span>
                <span className="text-ink-soft/40" aria-hidden>
                  ·
                </span>
                <span>
                  {t(locale, "planner.map.tiles")} {tileLabel}
                </span>
                {preference !== "auto" ? (
                  <span className="rounded-bp-xs bg-river/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-river">
                    {t(locale, "planner.map.selected")}
                  </span>
                ) : null}
              </p>
            </div>

            <SoftFailNotice open={softFail} compact band="footer">
              {t(locale, "planner.map.softFail")}
            </SoftFailNotice>
          </SheetPresence>
        </div>

        <div
          ref={searchWrapRef}
          className="animate-rise pointer-events-auto relative z-[3] min-w-0 flex-1 sm:max-w-sm sm:flex-none sm:basis-[min(100%,20rem)]"
          style={{ animationDelay: "80ms" }}
        >
          <label className="sr-only" htmlFor={searchId}>
            {t(locale, "planner.search")}
          </label>
          <div
            className={`flex items-center gap-2 rounded-bp border bg-foam/95 px-3 backdrop-blur-md transition duration-bp ease-bp-out-strong focus-within:border-river/50 focus-within:ring-2 focus-within:ring-focus/35 ${
              sheetOpen
                ? "border-river/40 shadow-bp ring-1 ring-river/15"
                : "border-[color:var(--bp-line)] shadow-bp-soft"
            }`}
          >
            <SearchGlyph
              className={`shrink-0 transition duration-bp-fast ease-bp-out ${
                sheetOpen ? "text-river" : "text-ink-soft"
              }`}
            />
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
              onFocus={() => {
                setEngineOpen(false);
                setLayersOpen(false);
              }}
              placeholder={t(locale, "planner.searchPlaceholder")}
              className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm text-ink outline-none ring-0 placeholder:text-ink-soft/45"
              autoComplete="off"
            />
            {searching ? (
              <span className="shrink-0 text-xs text-ink-soft/80" aria-hidden>
                …
              </span>
            ) : null}
          </div>

          <SheetPresence
            open={sheetOpen}
            variant="popover"
            className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp"
          >
            {/*
              Search SoftFail depth (BEA-302 / BEA-390) + craft SoftFail query
              parity (BEA-422) kept. Wave 59 residual (BEA-572 beyond #382):
              empty title leading-snug · empty/loading/spinner ink-soft/80.
              SoftFailBadge / Live · SoftFailSupport · compact SoftFailNotice ·
              softFailMistWash tip-011 body unchanged. Craft: ?searchSoftFail=1
              — never timber / Failed to fetch. No `/dev` gallery.
            */}
            <div
              className="animate-rise relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/80 px-3 py-2.5 pl-3.5 shadow-[inset_3px_0_0_var(--bp-river)]"
              style={{ animationDelay: "40ms" }}
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                  {t(locale, "planner.search.eyebrow")}
                </span>
                {hasResults ? (
                  <span className="text-[11px] font-medium text-ink-soft/80">
                    {t(locale, "planner.search.resultsCount").replace(
                      "{n}",
                      String(results.length),
                    )}
                  </span>
                ) : showEmpty ? (
                  <span className="text-[11px] font-medium text-ink-soft/80">
                    {t(locale, "planner.search.emptyCount")}
                  </span>
                ) : null}
                {searchOwnsSoftFail ? (
                  <SoftFailSupport>
                    {t(locale, "planner.search.softSupport")}
                  </SoftFailSupport>
                ) : (
                  <span className="text-[11px] leading-relaxed text-ink-soft/80">
                    {t(locale, "planner.search.support")}
                  </span>
                )}
              </div>
              {searchOwnsSoftFail ? (
                <SoftFailBadge className="transition duration-bp-fast ease-bp-out">
                  {t(locale, "planner.search.softBadge")}
                </SoftFailBadge>
              ) : searchDemo ? (
                <SoftFailBadge className="transition duration-bp-fast ease-bp-out">
                  {t(locale, "planner.search.demoBadge")}
                </SoftFailBadge>
              ) : (
                <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                  {t(locale, "planner.search.liveBadge")}
                </SoftFailLiveBadge>
              )}
            </div>

            {/* Compact SoftFail under azure rail — never timber / Failed to fetch. */}
            <SoftFailNotice
              open={searchOwnsSoftFail}
              compact
              fallback={t(locale, "planner.search.softFail")}
            >
              {searchSoftCopy}
            </SoftFailNotice>

            {hasResults ? (
              <ul
                id={listboxId}
                role="listbox"
                aria-label={t(locale, "planner.search.eyebrow")}
                className={`animate-rise max-h-64 overflow-auto py-1 ${
                  searchOwnsSoftFail ? softFailMistWashClass : ""
                }`}
                style={{ animationDelay: "70ms" }}
              >
                {results.map((place, i) => {
                  const selected = i === activeIndex;
                  const optionId = `${listboxId}-opt-${i}`;
                  return (
                    <li
                      key={place.enginePlaceId}
                      role="presentation"
                      className="animate-rise"
                      style={{ animationDelay: `${i * 40 + 85}ms` }}
                    >
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
                        className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition duration-bp ease-bp-out-strong active:scale-[0.995] ${
                          selected
                            ? "animate-stop-select bg-river/[0.06] shadow-[inset_3px_0_0_var(--bp-river)]"
                            : "hover:bg-mist/50"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums transition duration-bp-fast ease-bp-out ${
                            selected
                              ? "bg-river text-foam shadow-bp-soft ring-1 ring-river/30"
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
              <div
                className={`animate-rise space-y-1.5 px-3.5 py-4 ${
                  searchOwnsSoftFail ? softFailMistWashClass : ""
                }`}
                style={{ animationDelay: "70ms" }}
                role="status"
                aria-live="polite"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river/80">
                  {t(locale, "planner.search.emptyEyebrow")}
                </p>
                <p className="font-display text-sm font-semibold leading-snug tracking-tight text-ink">
                  {t(locale, "planner.search.emptyTitle")}
                </p>
                <p className="text-xs leading-relaxed text-ink-soft/80">
                  {t(locale, "planner.search.emptyHint")}
                </p>
              </div>
            ) : (
              <div
                className={`animate-rise px-3.5 py-3 text-xs leading-snug text-ink-soft/80 ${
                  searchOwnsSoftFail ? softFailMistWashClass : ""
                }`}
                style={{ animationDelay: "70ms" }}
                aria-busy
              >
                {t(locale, "planner.search")}
                …
              </div>
            )}
          </SheetPresence>
        </div>

        {/* Tool rail — secondary depth under search */}
        <div
          ref={layersRef}
          className="animate-rise pointer-events-auto relative ml-auto flex shrink-0 flex-col gap-1.5"
          style={{ animationDelay: "120ms" }}
        >
          <div
            className={`flex overflow-hidden rounded-bp border bg-foam/90 shadow-bp-soft backdrop-blur-md transition duration-bp ease-bp-out-strong ${
              layersOpen
                ? "border-river/40 shadow-bp ring-2 ring-river/20"
                : "border-[color:var(--bp-line)]"
            }`}
          >
            <button
              type="button"
              aria-expanded={layersOpen}
              aria-controls={layersId}
              aria-label={t(locale, "planner.map.layers")}
              onClick={() => {
                setLayersOpen((o) => !o);
                setEngineOpen(false);
              }}
              className={`flex h-10 w-10 items-center justify-center transition duration-bp-fast ease-bp-out hover:bg-mist/70 hover:text-ink active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                layersOpen ? "bg-mist/80 text-river" : "text-ink-soft"
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
              className="flex h-10 w-10 items-center justify-center text-ink-soft transition duration-bp-fast ease-bp-out hover:bg-mist/70 hover:text-ink active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
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
            className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp"
          >
            <header
              className="animate-rise relative border-b border-[color:var(--bp-line)] bg-paper/80 px-3 py-2.5 pl-3.5 shadow-[inset_3px_0_0_var(--bp-river)]"
              style={{ animationDelay: "40ms" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                    {t(locale, "planner.map.layersEyebrow")}
                  </p>
                  <p className="font-display text-sm font-semibold tracking-tight text-ink">
                    {t(locale, "planner.map.layersTitle")}
                  </p>
                  <p className="text-[11px] leading-relaxed text-ink-soft">
                    {t(locale, "planner.map.layersSupport")}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
                    layersActive > 0
                      ? "bg-river/12 text-river-deep"
                      : "bg-mist text-ink-soft"
                  }`}
                >
                  {layersActiveLabel}
                </span>
              </div>
            </header>
            <div
              className="animate-rise divide-y divide-[color:var(--bp-line)]"
              style={{ animationDelay: "70ms" }}
            >
              {(
                [
                  ["routes", "planner.map.layer.routes"],
                  ["stops", "planner.map.layer.stops"],
                  ["legend", "planner.map.layer.legend"],
                ] as const
              ).map(([key, labelKey]) => (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm transition duration-bp ease-bp-out-strong hover:bg-mist/50 active:scale-[0.995] ${
                    layers[key]
                      ? "animate-stop-select bg-river/[0.04] font-medium text-ink shadow-[inset_3px_0_0_var(--bp-river)]"
                      : "text-ink hover:shadow-[inset_3px_0_0_color-mix(in_srgb,var(--bp-river)_35%,transparent)]"
                  }`}
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
            </div>
          </SheetPresence>
        </div>
      </div>

      {/* Field tools — floating SoftFail depth + transfer legend (under chrome) */}
      <div className="absolute bottom-4 left-3 z-[1] flex max-w-[min(100%-5rem,22rem)] flex-col gap-2 sm:left-4">
        {/*
          Floating SoftFail depth (BEA-318 / BEA-390) + craft SoftFail query
          parity (BEA-422): azure Map rail · SoftFailBadge · SoftFailSupport ·
          compact SoftFailNotice mist band (border-b) · tip-011 mist-wash.
          Craft: ?mapSoftFail=1 — yields to search SoftFail (#226) / legend
          SoftFail / basemap SoftFail (locate SoftFail too); never timber /
          Failed to fetch.
        */}
        <SheetPresence
          open={floatingOwnsSoft}
          variant="popover"
          aria-label={t(locale, "planner.map.softEyebrow")}
          className="pointer-events-auto overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/90 shadow-bp-soft backdrop-blur-md"
        >
          <header
            className="animate-rise relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/80 px-3 py-2.5 pl-3.5 shadow-[inset_3px_0_0_var(--bp-river)]"
            style={{ animationDelay: "40ms" }}
          >
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                {t(locale, "planner.map.softEyebrow")}
              </span>
              <SoftFailSupport>
                {t(locale, "planner.map.softSupport")}
              </SoftFailSupport>
            </div>
            <SoftFailBadge className="transition duration-bp-fast ease-bp-out">
              {t(locale, "planner.map.softBadge")}
            </SoftFailBadge>
          </header>
          {/* Compact SoftFail mist band under azure Map rail · tip-011 mist-wash. */}
          <div
            className={`animate-rise ${softFailMistWashClass}`}
            style={{ animationDelay: "70ms" }}
          >
            <SoftFailNotice
              open={floatingOwnsSoft}
              compact
              fallback={t(locale, "planner.map.softFail")}
            >
              {floatingSoftCopy ?? ""}
            </SoftFailNotice>
          </div>
        </SheetPresence>

        {/*
          Legend SoftFail depth (BEA-350 / BEA-390) + craft SoftFail query
          parity (BEA-422): azure Transfer rail · SoftFailBadge / Live ·
          SoftFailSupport · compact SoftFail mist band (border-b) · tip-011
          mist-wash stroke body. Craft: ?legendSoftFail=1 — yields to search
          SoftFail (#226); floating SoftFail yields while legend owns; never
          timber / Failed to fetch.
        */}
        <SheetPresence
          open={legendOpen && !searchOwnsSoftFail}
          variant="popover"
          aria-label={t(locale, "planner.map.legendTitle")}
          className="pointer-events-none overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/90 shadow-bp-soft backdrop-blur-md"
        >
          <div
            className="animate-rise relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 pl-3.5 shadow-[inset_3px_0_0_var(--bp-river)]"
            style={{ animationDelay: "40ms" }}
          >
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                {t(locale, "planner.map.legendEyebrow")}
              </span>
              <span className="text-[11px] font-medium text-ink-soft/80">
                {t(locale, "planner.map.legendTitle")}
              </span>
              {legendSoft ? (
                <SoftFailSupport>
                  {t(locale, "planner.map.legendSoftSupport")}
                </SoftFailSupport>
              ) : null}
            </div>
            {legendSoft ? (
              <SoftFailBadge className="transition duration-bp-fast ease-bp-out">
                {t(locale, "planner.map.legendSoftBadge")}
              </SoftFailBadge>
            ) : (
              <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                {t(locale, "planner.map.legendLiveBadge")}
              </SoftFailLiveBadge>
            )}
          </div>

          {/* Compact SoftFail mist band under azure Transfer rail — never timber. */}
          <SoftFailNotice
            open={legendSoft}
            compact
            fallback={t(locale, "planner.map.legendSoftFail")}
          >
            {t(locale, "planner.map.legendSoftFail")}
          </SoftFailNotice>

          <div
            className={`animate-rise flex flex-wrap items-center gap-3 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft ${
              legendSoft ? softFailMistWashClass : ""
            }`}
            style={{ animationDelay: "70ms" }}
          >
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
        </SheetPresence>
      </div>
    </div>
  );
}

function EngineCaret({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className={`shrink-0 opacity-70 transition duration-bp-fast ease-bp-out ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M2.25 3.75 5 6.5l2.75-2.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
