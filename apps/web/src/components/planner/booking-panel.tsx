"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DemoBookingProvider,
  BOOKING_LINK_KINDS,
  normalizeBookingLinks,
  type BookingLink,
  type BookingLinkKind,
  type BookingSuggestion,
  type BookingSuggestionKind,
  type Stop,
  type Trip,
} from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashClass,
  softFailRailClass,
} from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
import { BookingOffersSkeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";

type Props = {
  tripId: string;
  locale: Locale;
  trip: Trip;
  stop: Stop | null;
  destinationHint?: string;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
  /** When true, expand and prefer the search → results flow (preview / demo). */
  defaultOpen?: boolean;
};

type DraftRow = {
  kind: BookingLinkKind;
  url: string;
  providerLabel: string;
};

type SearchResponse = {
  suggestions: BookingSuggestion[];
  mode: "demo" | "configured";
  provider: string;
};

type StatusResponse = {
  mode: "demo" | "configured";
  provider: string;
};

type KindFilter = BookingSuggestionKind | "all";

const KIND_FILTERS: KindFilter[] = ["all", "hotel", "activity"];
const demoProvider = new DemoBookingProvider();

/** Azure section eyebrow — matches place-intel / settings depth chrome. */
function SectionEyebrow({ children }: { children: string }) {
  return (
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
      {children}
    </p>
  );
}

function emptyDrafts(): DraftRow[] {
  return BOOKING_LINK_KINDS.map((kind) => ({
    kind,
    url: "",
    providerLabel: "",
  }));
}

function draftsFromStop(stop: Stop | null): DraftRow[] {
  const base = emptyDrafts();
  if (!stop) return base;
  for (const link of stop.bookingLinks ?? []) {
    const row = base.find((r) => r.kind === link.kind);
    if (row) {
      row.url = link.url;
      row.providerLabel = link.providerLabel ?? "";
    }
  }
  return base;
}

function kindLabel(locale: Locale, kind: BookingLinkKind): string {
  return t(locale, `planner.booking.kind.${kind}`);
}

function suggestionKindLabel(
  locale: Locale,
  kind: BookingSuggestionKind,
): string {
  return kind === "hotel"
    ? t(locale, "planner.booking.kind.hotel")
    : t(locale, "planner.booking.kind.ticket");
}

function filterLabel(locale: Locale, kind: KindFilter): string {
  if (kind === "all") return t(locale, "planner.booking.filterAll");
  if (kind === "hotel") return t(locale, "planner.booking.kind.hotel");
  return t(locale, "planner.booking.filterActivity");
}

async function searchLocal(
  city: string,
  checkIn: string,
  checkOut: string,
  kind: KindFilter,
  locale: Locale,
): Promise<SearchResponse> {
  const suggestions = await demoProvider.search({
    city,
    checkIn: checkIn || undefined,
    checkOut: checkOut || undefined,
    kind,
    locale,
  });
  return {
    suggestions,
    mode: "demo",
    provider: demoProvider.id,
  };
}

/**
 * Booking OTA sheet — SoftFail depth kept (BEA-389 / BEA-418) + wave 48 craft
 * residual (BEA-460): offer title on display `text-sm` (day-fill / place-intel
 * density) · BookingOffersSkeleton foam + `shadow-bp-soft` parity. Wave 52
 * (BEA-502): tip-011 `active:scale-[0.98]` on Search / Open / Use link / Save
 * (day-fill sibling). Wave 56 (BEA-536): Confirm draft Open chip tip-011
 * press (Expo Open already #350; list chips #371). Wave 63 (BEA-613): sheet
 * eyebrow `0.65rem`/`0.18em` · header/loading/empty meta `/80` snug (day-fill
 * #408 twin) · BookingOffersSkeleton `animate-preview-in` stagger twin of live
 * offers (#425 DayFillSkeleton pattern). Wave 64 (BEA-618): emptyResults
 * `leading-snug`. Wave 65 (BEA-642): sheet / suggest / results titles
 * `leading-snug` (day-fill #508/#544 twin; empty snug already #433). Wave 66
 * (BEA-660): results-list offer provider meta `leading-snug text-ink-soft/80`
 * (day-fill stop-walk + BookingLinkChips #395 twin). SoftFail stays under
 * OTA / Confirm rails; craft `?otaSoftFail=1` / `?confirmSoftFail=1`. Confirm
 * SoftFail yields OTA (no double depth). Never timber / Failed to fetch. No
 * `/dev` gallery.
 */
export function BookingPanel({
  tripId,
  locale,
  trip,
  stop,
  destinationHint,
  onSaved,
  onError,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(() => Boolean(stop) || defaultOpen);
  const [drafts, setDrafts] = useState<DraftRow[]>(() => draftsFromStop(stop));
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<BookingSuggestion[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [softDemo, setSoftDemo] = useState(false);
  /** Save soft-fail stays under the Confirm rail — never timber Failed to fetch. */
  const [confirmSoftFail, setConfirmSoftFail] = useState(false);
  /** Craft preview: /trips/…?otaSoftFail=1 — SoftFail depth under OTA rail. */
  const [otaSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("otaSoftFail") === "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…?confirmSoftFail=1 — SoftFail depth under Confirm. */
  const [confirmSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("confirmSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  const [searched, setSearched] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [city, setCity] = useState(destinationHint ?? "");
  const [checkIn, setCheckIn] = useState(trip.startDate ?? "");
  const [checkOut, setCheckOut] = useState(trip.endDate ?? "");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    setDrafts(draftsFromStop(stop));
    if (stop) setOpen(true);
  }, [stop]);

  useEffect(() => {
    setCity((prev) => prev || destinationHint || "");
  }, [destinationHint]);

  useEffect(() => {
    void apiGet<StatusResponse>("/v1/booking/status")
      .then((res) => {
        setStatus(res);
        setSoftDemo(false);
      })
      .catch(() => {
        setStatus({ mode: "demo", provider: demoProvider.id });
        setSoftDemo(true);
      });
  }, []);

  // Seed demo results so search → results is immediately usable without API.
  useEffect(() => {
    if (seeded) return;
    const q = (destinationHint || city || trip.destination || "").trim();
    if (!q) return;
    setSeeded(true);
    void (async () => {
      try {
        const res = await apiSend<SearchResponse>("/v1/booking/search", "POST", {
          city: q,
          checkIn: checkIn || undefined,
          checkOut: checkOut || undefined,
          kind: "all",
          locale,
        });
        setSuggestions(res.suggestions);
        setStatus({ mode: res.mode, provider: res.provider });
        setSoftDemo(false);
        setSearched(true);
      } catch (e) {
        if (isPlannerNoiseError(e)) {
          const local = await searchLocal(q, checkIn, checkOut, "all", locale);
          setSuggestions(local.suggestions);
          setStatus({ mode: local.mode, provider: local.provider });
          setSoftDemo(true);
          setSearched(true);
        }
      }
    })();
  }, [seeded, destinationHint, city, trip.destination, checkIn, checkOut, locale]);

  const savedCount = useMemo(
    () => (stop?.bookingLinks ?? []).filter((l) => l.url).length,
    [stop],
  );

  const pendingCount = useMemo(
    () => drafts.filter((d) => d.url.trim()).length,
    [drafts],
  );

  const isDirty = useMemo(() => {
    const baseline = draftsFromStop(stop);
    return BOOKING_LINK_KINDS.some((kind) => {
      const draft = drafts.find((d) => d.kind === kind)!;
      const saved = baseline.find((d) => d.kind === kind)!;
      return (
        draft.url.trim() !== saved.url.trim() ||
        draft.providerLabel.trim() !== saved.providerLabel.trim()
      );
    });
  }, [drafts, stop]);

  function updateDraft(
    kind: BookingLinkKind,
    patch: Partial<Omit<DraftRow, "kind">>,
  ) {
    setConfirmSoftFail(false);
    setDrafts((prev) =>
      prev.map((row) => (row.kind === kind ? { ...row, ...patch } : row)),
    );
  }

  async function save() {
    if (!stop) return;
    setSaving(true);
    onError("");
    try {
      const bookingLinks = normalizeBookingLinks(
        drafts.map((d) => ({
          kind: d.kind,
          url: d.url.trim(),
          providerLabel: d.providerLabel.trim() || undefined,
        })),
      );
      await apiSend<{ stop: Stop }>(
        `/v1/trips/${tripId}/stops/${stop.id}`,
        "PATCH",
        {
          bookingLinks,
          expectedVersion: trip.version,
        },
      );
      setConfirmSoftFail(false);
      await onSaved();
    } catch (e) {
      if (isPlannerNoiseError(e)) {
        // Confirm-rail SoftFailNotice only — never surface timber "Failed to fetch".
        setConfirmSoftFail(true);
        onError("");
        await onSaved();
      } else {
        onError(e instanceof Error ? e.message : "booking_save_failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function runSearch() {
    const q = city.trim();
    if (!q) {
      onError(t(locale, "planner.booking.cityRequired"));
      return;
    }
    setSearching(true);
    onError("");
    try {
      const res = await apiSend<SearchResponse>("/v1/booking/search", "POST", {
        city: q,
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        kind: kindFilter,
        locale,
      });
      setSuggestions(res.suggestions);
      setStatus({ mode: res.mode, provider: res.provider });
      setSoftDemo(false);
      setSearched(true);
      setOpen(true);
    } catch (e) {
      if (isPlannerNoiseError(e)) {
        const local = await searchLocal(q, checkIn, checkOut, kindFilter, locale);
        setSuggestions(local.suggestions);
        setStatus({ mode: local.mode, provider: local.provider });
        setSoftDemo(true);
        setSearched(true);
        setOpen(true);
      } else {
        onError(e instanceof Error ? e.message : "booking_search_failed");
      }
    } finally {
      setSearching(false);
    }
  }

  function applySuggestion(s: BookingSuggestion) {
    const kind: BookingLinkKind = s.kind === "hotel" ? "hotel" : "ticket";
    updateDraft(kind, {
      url: s.url,
      providerLabel: s.providerLabel,
    });
    setOpen(true);
  }

  function openExternal(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const isConfigured = status?.mode === "configured" && !softDemo;
  /**
   * OTA SoftFail helpers (BEA-389 after #284 / depth BEA-327) + craft SoftFail
   * query parity (BEA-418): SoftFailBadge · SoftFailSupport · SoftFailNotice
   * mist band · softFailMistWashClass tip-011. Craft: /trips/…?otaSoftFail=1
   * forces softFail under OTA. Confirm SoftFail yields OTA (no double depth).
   * Soft copy never timber / Failed to fetch.
   */
  const softFailCopy = t(locale, "planner.booking.softFail");
  const softCopy = otaSoftPreview
    ? softFailCopy
    : softDemo
      ? softFailCopy
      : status?.mode === "demo"
        ? t(locale, "planner.booking.demoNotice")
        : null;
  const badge = isConfigured
    ? t(locale, "planner.booking.configuredBadge")
    : t(locale, "planner.booking.demoBadge");
  const offerCountLabel = t(locale, "planner.booking.offerCount").replace(
    "{n}",
    String(suggestions.length),
  );

  /**
   * Confirm SoftFail helpers (BEA-389 after #284 / depth BEA-345) + craft
   * SoftFail query parity (BEA-418): SoftFailBadge Soft/Live · SoftFailSupport ·
   * SoftFailNotice mist band · softFailMistWashClass tip-011. Craft:
   * /trips/…?confirmSoftFail=1 — SoftFail depth under Confirm without a save
   * miss. Confirm owns save soft-fail so OTA SoftFail yields (no double depth).
   * Soft copy never timber / Failed to fetch.
   */
  const showConfirmSoftFail = confirmSoftPreview || confirmSoftFail;
  const showOtaSoftFail = Boolean(softCopy) && !showConfirmSoftFail;
  const sheetSupportCopy = showOtaSoftFail
    ? t(locale, "planner.booking.softSupport")
    : stop
      ? t(locale, "planner.booking.forStop").replace(
          "{name}",
          stop.place.name,
        )
      : t(locale, "planner.booking.support");
  const confirmSupportCopy = showConfirmSoftFail
    ? t(locale, "planner.booking.confirmSoftSupport")
    : t(locale, "planner.booking.confirmSupport");
  return (
    <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-bp-soft">
      {/*
        OTA SoftFail helpers (BEA-389 after #284 / depth BEA-327) + craft SoftFail
        query parity (BEA-418): softFailRailClass · SoftFailBadge · SoftFailSupport ·
        SoftFailNotice tip-011. Craft: ?otaSoftFail=1 — Confirm SoftFail still
        owns save soft-fail.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "relative flex w-full items-center justify-between gap-3 border-b border-[color:var(--bp-line)] px-4 py-3.5 text-left transition duration-bp-fast ease-bp-out hover:bg-mist/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-inset",
          showOtaSoftFail
            ? softFailRailClass
            : "bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]",
        ].join(" ")}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
              {t(locale, "planner.booking.sheetEyebrow")}
            </span>
            <span className="font-display text-lg leading-snug tracking-tight text-ink">
              {t(locale, "planner.booking.title")}
            </span>
            {isConfigured ? (
              <SoftFailLiveBadge>{badge}</SoftFailLiveBadge>
            ) : (
              <SoftFailBadge>{badge}</SoftFailBadge>
            )}
            {showOtaSoftFail ? (
              <SoftFailBadge>
                {t(locale, "planner.booking.otaSoftBadge")}
              </SoftFailBadge>
            ) : null}
            {suggestions.length > 0 ? (
              <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                {offerCountLabel}
              </span>
            ) : savedCount > 0 ? (
              <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                {t(locale, "planner.booking.savedCount").replace(
                  "{n}",
                  String(savedCount),
                )}
              </span>
            ) : null}
          </div>
          {showOtaSoftFail ? (
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
        aria-label={t(locale, "planner.booking.title")}
      >
        {/* Compact SoftFail mist band under azure OTA rail — Confirm SoftFail yields. */}
        <SoftFailNotice open={showOtaSoftFail} compact>
          {softCopy ?? ""}
        </SoftFailNotice>

        <div
          className={[
            "divide-y divide-[color:var(--bp-line)]",
            showOtaSoftFail ? softFailMistWashClass : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* Search — mist-track filters · city / dates · azure CTA */}
          <section
            className="animate-rise space-y-3 px-4 py-4"
            style={{ animationDelay: "50ms" }}
            aria-label={t(locale, "planner.booking.searchEyebrow")}
          >
            <div>
              <SectionEyebrow>
                {t(locale, "planner.booking.searchEyebrow")}
              </SectionEyebrow>
              <h3 className="mt-1 font-display text-base leading-snug tracking-tight text-ink">
                {t(locale, "planner.booking.suggestTitle")}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                {t(locale, "planner.booking.suggestSupport")}
              </p>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                {t(locale, "planner.booking.filterLabel")}
              </div>
              <div
                className="flex flex-wrap gap-0.5 rounded-bp-sm bg-mist/50 p-1"
                role="group"
                aria-label={t(locale, "planner.booking.filterLabel")}
              >
                {KIND_FILTERS.map((id) => {
                  const on = kindFilter === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setKindFilter(id)}
                      className={`rounded-bp-xs px-3 py-1.5 text-sm font-semibold bp-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                        on
                          ? "animate-stop-select bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
                          : "text-ink-soft hover:bg-foam/70 hover:text-river"
                      }`}
                    >
                      {filterLabel(locale, id)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block sm:col-span-1">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.booking.cityPlaceholder")}
                </span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t(locale, "planner.booking.cityPlaceholder")}
                  className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 placeholder:text-ink-soft/50 transition duration-bp-fast ease-bp-out focus:border-river/40 focus:ring-2 focus-visible:ring-focus/40"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.booking.checkIn")}
                </span>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 transition duration-bp-fast ease-bp-out focus:border-river/40 focus:ring-2 focus-visible:ring-focus/40"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.booking.checkOut")}
                </span>
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 transition duration-bp-fast ease-bp-out focus:border-river/40 focus:ring-2 focus-visible:ring-focus/40"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={searching}
              onClick={() => void runSearch()}
              className="rounded-bp bg-river px-4 py-2.5 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam disabled:cursor-not-allowed disabled:opacity-40"
            >
              {searching
                ? t(locale, "planner.booking.searching")
                : t(locale, "planner.booking.search")}
            </button>
          </section>

          {/* Results — ranked offers with azure deep-link out */}
          <section
            className="animate-rise space-y-3 px-4 py-4"
            style={{ animationDelay: "70ms" }}
            aria-label={t(locale, "planner.booking.resultsEyebrow")}
          >
            <div>
              <SectionEyebrow>
                {t(locale, "planner.booking.resultsEyebrow")}
              </SectionEyebrow>
              {suggestions.length > 0 && !searching ? (
                <>
                  <h3 className="mt-1 font-display text-base leading-snug tracking-tight text-ink">
                    {t(locale, "planner.booking.resultsTitle").replace(
                      "{n}",
                      String(suggestions.length),
                    )}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                    {t(locale, "planner.booking.resultsSupport")}
                  </p>
                </>
              ) : null}
            </div>

            {searching && (
              <div
                className="animate-rise space-y-2"
                role="status"
                aria-live="polite"
                style={{ animationDelay: "60ms" }}
              >
                <BookingOffersSkeleton />
                <p className="text-xs leading-snug text-ink-soft/80">
                  {t(locale, "planner.booking.loadingHint")}
                </p>
              </div>
            )}

            {!searching && searched && suggestions.length === 0 && (
              <div
                className="animate-rise max-w-sm space-y-1.5 px-0.5 py-2"
                style={{ animationDelay: "70ms" }}
                role="status"
                aria-live="polite"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river/80">
                  {t(locale, "planner.booking.emptyEyebrow")}
                </p>
                <p className="font-display text-lg font-semibold leading-snug tracking-tight text-ink">
                  {t(locale, "planner.booking.emptyResults")}
                </p>
                <p className="text-sm leading-relaxed text-ink-soft/80">
                  {t(locale, "planner.booking.emptyHint")}
                </p>
              </div>
            )}

            {!searching && suggestions.length > 0 && (
              <ul className="animate-rise space-y-2">
                {suggestions.map((s, i) => (
                  <li
                    key={s.id}
                    className="animate-preview-in overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)]/80 bg-foam px-3 py-3 shadow-bp-soft transition duration-bp-fast ease-bp-out hover:border-river/35 hover:shadow-bp"
                    style={{ animationDelay: `${80 + i * 40}ms` }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <span className="inline-flex rounded-bp-xs border border-river/20 bg-river/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river-deep">
                          {suggestionKindLabel(locale, s.kind)}
                        </span>
                        <div className="font-display text-sm font-semibold leading-snug tracking-tight text-ink">
                          {s.title}
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          {s.priceHint ? (
                            <span className="inline-flex items-baseline gap-1 rounded-bp-xs bg-river/10 px-2 py-0.5 font-display text-base font-bold tracking-tight text-river shadow-[inset_2px_0_0_var(--bp-river)]">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-river/75">
                                {t(locale, "planner.booking.priceLabel")}
                              </span>
                              <span>{s.priceHint}</span>
                            </span>
                          ) : null}
                          {typeof s.ratingHint === "number" ? (
                            <span className="inline-flex items-baseline gap-1 text-xs font-medium text-ink">
                              <span
                                aria-hidden
                                className="text-[0.7rem] font-bold text-river/80"
                              >
                                ★
                              </span>
                              <span>{s.ratingHint.toFixed(1)}</span>
                              <span className="sr-only">
                                {t(locale, "planner.booking.rating").replace(
                                  "{n}",
                                  s.ratingHint.toFixed(1),
                                )}
                              </span>
                            </span>
                          ) : null}
                          <span className="text-xs leading-snug text-ink-soft/80">
                            {s.providerLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:min-w-[7.5rem]">
                        <button
                          type="button"
                          onClick={() => openExternal(s.url)}
                          className="rounded-bp bg-river px-3.5 py-2 text-xs font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
                        >
                          {t(locale, "planner.booking.openExternal")}
                        </button>
                        {stop && (
                          <button
                            type="button"
                            onClick={() => applySuggestion(s)}
                            className="rounded-bp-sm border border-river/35 bg-foam px-2.5 py-1.5 text-xs font-medium text-river transition duration-bp-fast ease-bp-out hover:border-river/60 hover:bg-river/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
                          >
                            {t(locale, "planner.booking.useLink")}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!searching && !searched && (
              <div
                className="animate-rise max-w-sm space-y-1.5 px-0.5 py-2"
                style={{ animationDelay: "70ms" }}
                role="status"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river/80">
                  {t(locale, "planner.booking.emptyEyebrow")}
                </p>
                <p className="text-sm leading-relaxed text-ink-soft">
                  {t(locale, "planner.booking.suggestSupport")}
                </p>
              </div>
            )}
          </section>

          {/*
            Confirm SoftFail helpers (BEA-389 after #284 / depth BEA-345) + craft
            SoftFail query parity (BEA-418): softFailRailClass · SoftFailBadge
            Soft/Live · SoftFailSupport · SoftFailNotice mist band ·
            softFailMistWashClass tip-011. Craft: ?confirmSoftFail=1 — OTA
            SoftFail yields while Confirm owns; never timber.
          */}
          <section
            className="animate-rise px-4 py-4"
            style={{ animationDelay: "90ms" }}
            aria-label={t(locale, "planner.booking.confirmEyebrow")}
          >
            <div className="overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft">
              <div
                className={[
                  "relative flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--bp-line)] px-3 py-3",
                  showConfirmSoftFail
                    ? softFailRailClass
                    : "bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SectionEyebrow>
                      {t(locale, "planner.booking.confirmEyebrow")}
                    </SectionEyebrow>
                    {pendingCount > 0 ? (
                      <span className="rounded-bp-xs bg-river/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-river-deep shadow-[inset_2px_0_0_var(--bp-river)]">
                        {t(locale, "planner.booking.confirmPending").replace(
                          "{n}",
                          String(pendingCount),
                        )}
                      </span>
                    ) : null}
                    {isDirty ? (
                      <span className="rounded-bp-xs bg-mist px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/70 ring-1 ring-[color:var(--bp-line)] bp-transition">
                        {t(locale, "planner.booking.confirmDirty")}
                      </span>
                    ) : null}
                    {showConfirmSoftFail ? (
                      <SoftFailBadge>
                        {t(locale, "planner.booking.confirmSoftBadge")}
                      </SoftFailBadge>
                    ) : (
                      <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                        {t(locale, "planner.booking.confirmSoftLiveBadge")}
                      </SoftFailLiveBadge>
                    )}
                  </div>
                  <h3 className="mt-1 font-display text-base tracking-tight text-ink">
                    {t(locale, "planner.booking.confirmTitle")}
                  </h3>
                  {showConfirmSoftFail ? (
                    <SoftFailSupport className="mt-1 block">
                      {confirmSupportCopy}
                    </SoftFailSupport>
                  ) : (
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                      {confirmSupportCopy}
                    </p>
                  )}
                </div>
                {stop ? (
                  <button
                    type="button"
                    disabled={saving || !isDirty}
                    onClick={() => void save()}
                    className="rounded-bp bg-river px-4 py-2.5 text-sm font-semibold tracking-wide text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving
                      ? t(locale, "planner.booking.saving")
                      : t(locale, "planner.booking.save")}
                  </button>
                ) : null}
              </div>

              {/* Compact SoftFail mist band under azure Confirm rail — OTA SoftFail yields. */}
              <SoftFailNotice open={showConfirmSoftFail} compact>
                {t(locale, "planner.booking.confirmSoftFail")}
              </SoftFailNotice>

              <SheetPresence
                open
                className={[
                  "space-y-3 px-3 py-3",
                  showConfirmSoftFail ? softFailMistWashClass : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ animationDelay: "40ms" }}
                aria-label={t(locale, "planner.booking.confirmTitle")}
              >
                {!stop ? (
                  <p
                    className="animate-rise text-sm leading-relaxed text-ink-soft"
                    style={{ animationDelay: "55ms" }}
                  >
                    {t(locale, "planner.booking.selectStop")}
                  </p>
                ) : (
                  drafts.map((row, i) => {
                    const filled = Boolean(row.url.trim());
                    return (
                      <div
                        key={row.kind}
                        className={`space-y-1.5 rounded-bp-sm border px-3 py-3 transition duration-bp-fast ease-bp-out ${
                          filled
                            ? "animate-stop-select border-river/30 bg-river/[0.04] shadow-[inset_3px_0_0_var(--bp-river)]"
                            : "animate-rise border-[color:var(--bp-line)]/70 bg-paper/50 hover:border-river/25"
                        }`}
                        style={{ animationDelay: `${55 + i * 35}ms` }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                            {kindLabel(locale, row.kind)}
                          </label>
                          {filled ? (
                            <button
                              type="button"
                              onClick={() => openExternal(row.url.trim())}
                              className="rounded-bp-xs border border-river/35 bg-river/5 px-2 py-1 text-[11px] font-semibold text-river transition duration-bp-fast ease-bp-out hover:border-river/60 hover:bg-river/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
                            >
                              {t(locale, "planner.booking.open")}
                            </button>
                          ) : null}
                        </div>
                        <input
                          value={row.providerLabel}
                          onChange={(e) =>
                            updateDraft(row.kind, {
                              providerLabel: e.target.value,
                            })
                          }
                          placeholder={t(
                            locale,
                            "planner.booking.providerPlaceholder",
                          )}
                          className="w-full rounded-bp-xs border border-[color:var(--bp-line)] bg-foam px-3 py-2 text-sm text-ink outline-none ring-river/30 placeholder:text-ink-soft/50 transition duration-bp-fast ease-bp-out focus:border-river/40 focus:ring-2 focus-visible:ring-focus/40"
                        />
                        <input
                          value={row.url}
                          onChange={(e) =>
                            updateDraft(row.kind, { url: e.target.value })
                          }
                          placeholder={t(
                            locale,
                            "planner.booking.urlPlaceholder",
                          )}
                          className="w-full rounded-bp-xs border border-[color:var(--bp-line)] bg-foam px-3 py-2 text-sm text-ink outline-none ring-river/30 placeholder:text-ink-soft/50 transition duration-bp-fast ease-bp-out focus:border-river/40 focus:ring-2 focus-visible:ring-focus/40"
                        />
                      </div>
                    );
                  })
                )}
              </SheetPresence>
            </div>
          </section>
        </div>

        <p
          className="animate-rise border-t border-[color:var(--bp-line)] px-4 py-2.5 text-[11px] leading-relaxed text-ink-soft/80"
          style={{ animationDelay: "110ms" }}
        >
          {t(locale, "planner.booking.hint")}
        </p>
      </SheetPresence>
    </div>
  );
}

/**
 * Compact booking chips on a stop list row — mist-track · foam ring · tip-011
 * press (presence pills / Mode mist chips sibling). Beyond #371 / Confirm #384 —
 * SoftFail stays on OTA/Confirm rails.
 */
export function BookingLinkChips({
  links,
  locale,
}: {
  links: BookingLink[] | undefined;
  locale: Locale;
}) {
  const rows = links ?? [];
  if (rows.length === 0) return null;
  return (
    <div
      className="mt-2 inline-flex max-w-full flex-wrap gap-0.5 rounded-bp-sm bg-mist/50 p-1"
      role="group"
      aria-label={t(locale, "planner.booking.linksEyebrow")}
    >
      {rows.map((link) => (
        <a
          key={`${link.kind}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-full items-center gap-1 rounded-bp-xs bg-foam px-2 py-1 text-[11px] font-semibold text-river shadow-bp-soft ring-1 ring-river/20 transition duration-bp-fast ease-bp-out-strong hover:ring-river/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
        >
          <span>{kindLabel(locale, link.kind)}</span>
          {link.providerLabel ? (
            <span className="truncate font-medium text-ink-soft/80">
              · {link.providerLabel}
            </span>
          ) : null}
        </a>
      ))}
    </div>
  );
}
