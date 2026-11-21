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
import { SoftFailNotice } from "@/components/soft-fail-notice";
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

  function updateDraft(
    kind: BookingLinkKind,
    patch: Partial<Omit<DraftRow, "kind">>,
  ) {
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
      setSoftDemo(false);
      await onSaved();
    } catch (e) {
      if (isPlannerNoiseError(e)) {
        // Soft demo banner only — never surface timber "Failed to fetch".
        setSoftDemo(true);
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

  const badge =
    status?.mode === "configured"
      ? t(locale, "planner.booking.configuredBadge")
      : t(locale, "planner.booking.demoBadge");

  return (
    <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/55">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition duration-bp-fast ease-bp-out hover:bg-mist/35"
        aria-expanded={open}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg tracking-tight text-ink">
              {t(locale, "planner.booking.title")}
            </span>
            <span className="rounded-bp-xs bg-river/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river">
              {badge}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            {stop
              ? t(locale, "planner.booking.forStop").replace(
                  "{name}",
                  stop.place.name,
                )
              : t(locale, "planner.booking.support")}
            {savedCount > 0
              ? ` · ${t(locale, "planner.booking.savedCount").replace("{n}", String(savedCount))}`
              : ""}
          </p>
        </div>
        <span
          className={`text-river transition duration-bp ease-bp ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          className="animate-sheet-in space-y-5 border-t border-[color:var(--bp-line)] px-4 py-4"
          style={{ animationDelay: "40ms" }}
        >
          {(softDemo || status?.mode === "demo") && (
            <SoftFailNotice>
              {t(locale, "planner.booking.demoNotice")}
            </SoftFailNotice>
          )}

          {/* Primary flow: search → results → deep-link out */}
          <section className="space-y-3">
            <div>
              <h3 className="font-display text-base tracking-tight text-ink">
                {t(locale, "planner.booking.suggestTitle")}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                {t(locale, "planner.booking.suggestSupport")}
              </p>
            </div>

            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t(locale, "planner.booking.filterLabel")}
            >
              {KIND_FILTERS.map((id) => {
                const on = kindFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setKindFilter(id)}
                    className={`rounded-bp-sm px-3 py-1.5 text-sm transition duration-bp-fast ease-bp-out ${
                      on
                        ? "bg-river text-foam"
                        : "border border-[color:var(--bp-line)] bg-paper/70 text-ink-soft hover:border-river/40 hover:text-river"
                    }`}
                  >
                    {filterLabel(locale, id)}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block sm:col-span-1">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.booking.cityPlaceholder")}
                </span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t(locale, "planner.booking.cityPlaceholder")}
                  className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 placeholder:text-ink-soft/50 focus:ring-2"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.booking.checkIn")}
                </span>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 focus:ring-2"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.booking.checkOut")}
                </span>
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 focus:ring-2"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={searching}
              onClick={() => void runSearch()}
              className="rounded-bp bg-river px-4 py-2 text-sm font-semibold text-foam transition duration-bp ease-bp hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {searching
                ? t(locale, "planner.booking.searching")
                : t(locale, "planner.booking.search")}
            </button>

            {searched && suggestions.length === 0 && (
              <p className="text-sm text-ink-soft">
                {t(locale, "planner.booking.emptyResults")}
              </p>
            )}

            {suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                  {t(locale, "planner.booking.resultsTitle").replace(
                    "{n}",
                    String(suggestions.length),
                  )}
                </div>
                <ul className="space-y-2">
                  {suggestions.map((s, i) => (
                    <li
                      key={s.id}
                      className="animate-preview-in rounded-bp-sm border border-[color:var(--bp-line)]/80 bg-paper/50 px-3 py-3"
                      style={{ animationDelay: `${60 + i * 40}ms` }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-ink">
                            {s.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
                            <span className="rounded bg-mist/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                              {suggestionKindLabel(locale, s.kind)}
                            </span>
                            <span>{s.providerLabel}</span>
                            {s.priceHint ? <span>· {s.priceHint}</span> : null}
                            {typeof s.ratingHint === "number" ? (
                              <span>
                                · {t(locale, "planner.booking.rating").replace(
                                  "{n}",
                                  s.ratingHint.toFixed(1),
                                )}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openExternal(s.url)}
                            className="rounded-bp bg-river px-3 py-1.5 text-xs font-semibold text-foam transition duration-bp-fast ease-bp-out hover:bg-river-deep"
                          >
                            {t(locale, "planner.booking.openExternal")}
                          </button>
                          {stop && (
                            <button
                              type="button"
                              onClick={() => applySuggestion(s)}
                              className="rounded-bp-sm border border-river/30 px-2.5 py-1.5 text-xs font-medium text-river transition duration-bp-fast ease-bp-out hover:bg-river/10"
                            >
                              {t(locale, "planner.booking.useLink")}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Secondary: persist deep links on the selected stop */}
          <section className="space-y-3 border-t border-[color:var(--bp-line)] pt-4">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                {t(locale, "planner.booking.linksTitle")}
              </h3>
            </div>
            {!stop ? (
              <p className="text-sm text-ink-soft">
                {t(locale, "planner.booking.selectStop")}
              </p>
            ) : (
              <div className="space-y-3">
                {drafts.map((row) => (
                  <div key={row.kind} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">
                        {kindLabel(locale, row.kind)}
                      </label>
                      {row.url.trim() && (
                        <button
                          type="button"
                          onClick={() => openExternal(row.url.trim())}
                          className="text-xs font-medium text-river hover:underline"
                        >
                          {t(locale, "planner.booking.open")}
                        </button>
                      )}
                    </div>
                    <input
                      value={row.providerLabel}
                      onChange={(e) =>
                        updateDraft(row.kind, { providerLabel: e.target.value })
                      }
                      placeholder={t(
                        locale,
                        "planner.booking.providerPlaceholder",
                      )}
                      className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 placeholder:text-ink-soft/50 focus:ring-2"
                    />
                    <input
                      value={row.url}
                      onChange={(e) =>
                        updateDraft(row.kind, { url: e.target.value })
                      }
                      placeholder={t(locale, "planner.booking.urlPlaceholder")}
                      className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 placeholder:text-ink-soft/50 focus:ring-2"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-bp bg-ink px-4 py-2 text-sm font-semibold text-foam transition duration-bp ease-bp hover:bg-river-deep disabled:opacity-40"
                >
                  {saving
                    ? t(locale, "planner.booking.saving")
                    : t(locale, "planner.booking.save")}
                </button>
              </div>
            )}
          </section>

          <p className="text-[11px] leading-relaxed text-ink-soft/80">
            {t(locale, "planner.booking.hint")}
          </p>
        </div>
      )}
    </div>
  );
}

/** Compact chips for a stop list row. */
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
    <div className="mt-2 flex flex-wrap gap-1.5">
      {rows.map((link) => (
        <a
          key={`${link.kind}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-bp-xs border border-river/25 bg-river/5 px-2 py-0.5 text-[11px] font-medium text-river transition duration-bp-fast ease-bp-out hover:border-river/50 hover:bg-river/10"
        >
          <span>{kindLabel(locale, link.kind)}</span>
          {link.providerLabel ? (
            <span className="text-ink-soft">· {link.providerLabel}</span>
          ) : null}
        </a>
      ))}
    </div>
  );
}
