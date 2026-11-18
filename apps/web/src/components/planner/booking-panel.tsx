"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BookingLink,
  BookingLinkKind,
  BookingSuggestion,
  Stop,
  Trip,
} from "@beaver/core";
import { BOOKING_LINK_KINDS, normalizeBookingLinks } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { apiGet, apiSend } from "@/lib/api";

type Props = {
  tripId: string;
  locale: Locale;
  trip: Trip;
  stop: Stop | null;
  destinationHint?: string;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
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

export function BookingPanel({
  tripId,
  locale,
  trip,
  stop,
  destinationHint,
  onSaved,
  onError,
}: Props) {
  const [open, setOpen] = useState(() => Boolean(stop));
  const [drafts, setDrafts] = useState<DraftRow[]>(() => draftsFromStop(stop));
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<BookingSuggestion[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [city, setCity] = useState(destinationHint ?? "");
  const [checkIn, setCheckIn] = useState(trip.startDate ?? "");
  const [checkOut, setCheckOut] = useState(trip.endDate ?? "");

  useEffect(() => {
    setDrafts(draftsFromStop(stop));
    if (stop) setOpen(true);
  }, [stop]);

  useEffect(() => {
    setCity((prev) => prev || destinationHint || "");
  }, [destinationHint]);

  useEffect(() => {
    void apiGet<StatusResponse>("/v1/booking/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

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
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "booking_save_failed");
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
        kind: "all",
        locale,
      });
      setSuggestions(res.suggestions);
      setStatus({ mode: res.mode, provider: res.provider });
    } catch (e) {
      onError(e instanceof Error ? e.message : "booking_search_failed");
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
    <div className="overflow-hidden rounded-md border border-[color:var(--bp-line)] bg-foam/55">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-mist/35"
        aria-expanded={open}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg tracking-tight text-ink">
              {t(locale, "planner.booking.title")}
            </span>
            <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-river ring-1 ring-river/25">
              {badge}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-soft">
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
        <span className="text-ink-soft">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-[color:var(--bp-line)] px-4 py-4">
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
                        className="text-xs text-river hover:underline"
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
                    placeholder={t(locale, "planner.booking.providerPlaceholder")}
                    className="w-full rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 placeholder:text-ink-soft/50 focus:ring-2"
                  />
                  <input
                    value={row.url}
                    onChange={(e) =>
                      updateDraft(row.kind, { url: e.target.value })
                    }
                    placeholder={t(locale, "planner.booking.urlPlaceholder")}
                    className="w-full rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-3 py-2 text-sm text-ink outline-none ring-river/30 placeholder:text-ink-soft/50 focus:ring-2"
                  />
                </div>
              ))}
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-bp bg-river px-4 py-2 text-sm font-semibold text-foam transition hover:bg-river-deep disabled:opacity-40"
              >
                {saving
                  ? t(locale, "planner.booking.saving")
                  : t(locale, "planner.booking.save")}
              </button>
            </div>
          )}

          <div className="space-y-3 border-t border-[color:var(--bp-line)] pt-4">
            <div>
              <h3 className="text-sm font-medium text-ink">
                {t(locale, "planner.booking.suggestTitle")}
              </h3>
              <p className="mt-0.5 text-xs text-ink-soft">
                {t(locale, "planner.booking.suggestSupport")}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t(locale, "planner.booking.cityPlaceholder")}
                className="rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-3 py-2 text-sm outline-none ring-river/30 focus:ring-2 sm:col-span-1"
              />
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-3 py-2 text-sm outline-none ring-river/30 focus:ring-2"
              />
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-3 py-2 text-sm outline-none ring-river/30 focus:ring-2"
              />
            </div>
            <button
              type="button"
              disabled={searching}
              onClick={() => void runSearch()}
              className="rounded-md border border-[color:var(--bp-line)] bg-foam/70 px-3 py-2 text-sm text-ink-soft transition hover:border-river/40 hover:text-river disabled:opacity-40"
            >
              {searching
                ? t(locale, "planner.booking.searching")
                : t(locale, "planner.booking.search")}
            </button>

            {suggestions.length > 0 && (
              <ul className="divide-y divide-[color:var(--bp-line)] border border-[color:var(--bp-line)]">
                {suggestions.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-start justify-between gap-2 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">{s.title}</div>
                      <div className="mt-0.5 text-xs text-ink-soft">
                        {s.kind === "hotel"
                          ? t(locale, "planner.booking.kind.hotel")
                          : t(locale, "planner.booking.kind.ticket")}
                        {" · "}
                        {s.providerLabel}
                        {s.priceHint ? ` · ${s.priceHint}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => openExternal(s.url)}
                        className="text-xs text-river hover:underline"
                      >
                        {t(locale, "planner.booking.open")}
                      </button>
                      {stop && (
                        <button
                          type="button"
                          onClick={() => applySuggestion(s)}
                          className="rounded border border-river/30 px-2 py-1 text-xs text-river transition hover:bg-river/10"
                        >
                          {t(locale, "planner.booking.useLink")}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
          className="inline-flex items-center gap-1 rounded border border-river/25 bg-river/5 px-2 py-0.5 text-[11px] text-river transition hover:border-river/50 hover:bg-river/10"
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
