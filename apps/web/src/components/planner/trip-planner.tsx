"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Day,
  Leg,
  MapEngineId,
  PlaceSummary,
  Stop,
  Trip,
} from "@beaver/core";
import {
  formatDistance,
  formatDuration,
  stopsForDay,
  summarizeTransfer,
} from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { apiGet, apiSend } from "@/lib/api";
import { TripCollabPanel } from "@/components/collab/trip-collab-panel";
import { TripMembersBar } from "@/components/collab/trip-members";
import { OfflinePinControl } from "@/components/offline/offline-pin-control";
import { BookingLinkChips, BookingPanel } from "./booking-panel";
import { DayFillPanel } from "./day-fill-panel";
import { MapStage } from "./map-stage";
import { TransferSteps } from "./transfer-steps";

type TripPayload = {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
};

type SearchResponse = {
  places: PlaceSummary[];
  engineId: MapEngineId;
  mode: "live" | "demo";
  region: string;
};

type EngineResponse = {
  preference: string;
  region: string;
  engineId: MapEngineId;
  mode: "live" | "demo";
};

type Props = {
  tripId: string;
  locale: Locale;
  initial: TripPayload | null;
};

type TravelMode = "walk" | "transit" | "drive";

export function TripPlanner({ tripId, locale, initial }: Props) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(initial?.trip ?? null);
  const [days, setDays] = useState<Day[]>(initial?.days ?? []);
  const [stops, setStops] = useState<Stop[]>(initial?.stops ?? []);
  const [legs, setLegs] = useState<Leg[]>(initial?.legs ?? []);
  const [dayId, setDayId] = useState<string | null>(
    initial?.days[0]?.id ?? null,
  );
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [engineInfo, setEngineInfo] = useState<EngineResponse | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("transit");
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [duplicating, setDuplicating] = useState(false);
  const [copyJournal, setCopyJournal] = useState(false);

  const preference = trip?.mapEngine ?? "auto";

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );

  const dayLegs = useMemo(() => {
    const ids = new Set(dayStops.map((s) => s.id));
    return legs.filter((l) => ids.has(l.fromStopId) && ids.has(l.toStopId));
  }, [legs, dayStops]);

  const refresh = useCallback(async () => {
    const data = await apiGet<TripPayload>(`/v1/trips/${tripId}`);
    setTrip(data.trip);
    setDays(data.days);
    setStops(data.stops);
    setLegs(data.legs);
    setDayId((prev) => prev ?? data.days[0]?.id ?? null);
  }, [tripId]);

  useEffect(() => {
    if (initial) return;
    startTransition(() => {
      void refresh().catch((e: Error) => setError(e.message));
    });
  }, [initial, refresh]);

  useEffect(() => {
    void apiGet<EngineResponse>(
      `/v1/maps/engine?preference=${encodeURIComponent(preference)}&timezone=${encodeURIComponent(trip?.timezone ?? "")}`,
    )
      .then(setEngineInfo)
      .catch(() => setEngineInfo(null));
  }, [preference, trip?.timezone]);

  async function runSearch(text: string) {
    const q = text.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const center = dayStops[0]?.place;
      const params = new URLSearchParams({
        q,
        engine: preference,
        language: locale,
      });
      if (center) {
        params.set("lat", String(center.lat));
        params.set("lng", String(center.lng));
      }
      if (trip?.timezone) params.set("timezone", trip.timezone);
      const data = await apiGet<SearchResponse>(
        `/v1/places/search?${params}`,
      );
      setResults(data.places);
      setEngineInfo((prev) =>
        prev
          ? { ...prev, engineId: data.engineId, mode: data.mode, region: data.region }
          : {
              preference,
              engineId: data.engineId,
              mode: data.mode,
              region: data.region,
            },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "search_failed");
    } finally {
      setSearching(false);
    }
  }

  async function addPlace(place: PlaceSummary) {
    if (!dayId || !trip) return;
    setError(null);
    try {
      await apiSend(`/v1/trips/${tripId}/stops`, "POST", {
        dayId,
        place,
        engine: engineInfo?.engineId,
        expectedVersion: trip.version,
      });
      setQuery("");
      setResults([]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "add_failed");
    }
  }

  async function removeStop(stopId: string) {
    if (!trip) return;
    setError(null);
    try {
      await apiSend(`/v1/trips/${tripId}/stops/${stopId}`, "DELETE", {
        expectedVersion: trip.version,
      });
      if (selectedStopId === stopId) setSelectedStopId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete_failed");
    }
  }

  async function moveStop(stopId: string, dir: -1 | 1) {
    if (!dayId || !trip) return;
    const ordered = dayStops.map((s) => s.id);
    const idx = ordered.indexOf(stopId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= ordered.length) return;
    const swapped = [...ordered];
    const tmp = swapped[idx]!;
    swapped[idx] = swapped[next]!;
    swapped[next] = tmp;
    try {
      await apiSend(`/v1/trips/${tripId}/stops/reorder`, "PATCH", {
        dayId,
        orderedIds: swapped,
        expectedVersion: trip.version,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "reorder_failed");
    }
  }

  async function setEnginePreference(next: Trip["mapEngine"]) {
    if (!trip) return;
    try {
      const res = await apiSend<{ trip: Trip }>(`/v1/trips/${tripId}`, "PATCH", {
        mapEngine: next,
        expectedVersion: trip.version,
      });
      setTrip(res.trip);
    } catch (e) {
      setError(e instanceof Error ? e.message : "engine_failed");
    }
  }

  async function generateRoutes() {
    if (!dayId) return;
    setRouting(true);
    setError(null);
    try {
      const res = await apiSend<{
        legs: Leg[];
        mode: "live" | "demo";
        engineId: MapEngineId;
      }>(`/v1/trips/${tripId}/route-day`, "POST", {
        dayId,
        mode: travelMode,
        engine: preference,
      });
      setLegs((prev) => {
        const ids = new Set(dayStops.map((s) => s.id));
        const kept = prev.filter(
          (l) => !(ids.has(l.fromStopId) && ids.has(l.toStopId)),
        );
        return [...kept, ...res.legs];
      });
      setEngineInfo((prev) =>
        prev
          ? { ...prev, engineId: res.engineId, mode: res.mode }
          : {
              preference,
              engineId: res.engineId,
              mode: res.mode,
              region: "other",
            },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "route_failed");
    } finally {
      setRouting(false);
    }
  }

  async function duplicateTrip() {
    setDuplicating(true);
    setError(null);
    try {
      const res = await apiSend<{ trip: Trip }>(
        `/v1/trips/${tripId}/duplicate`,
        "POST",
        { copyJournal },
      );
      router.push(`/trips/${res.trip.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "duplicate_failed");
      setDuplicating(false);
    }
  }

  if (!trip && pending) {
    return (
      <div className="px-6 py-20 text-ink-soft md:px-10">
        {t(locale, "planner.loading")}
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="px-6 py-20 text-ink-soft md:px-10">
        {error ?? t(locale, "planner.notFound")}
      </div>
    );
  }

  const engineLabel =
    engineInfo?.engineId === "amap"
      ? t(locale, "planner.engine.amap")
      : engineInfo?.engineId === "baidu"
        ? t(locale, "planner.engine.baidu")
        : t(locale, "planner.engine.google");
  const modeLabel =
    engineInfo?.mode === "live"
      ? t(locale, "planner.mode.live")
      : t(locale, "planner.mode.demo");

  return (
    <div className="mx-auto max-w-[1480px] px-3 pb-16 pt-2 md:px-6 lg:px-8 lg:pt-4">
      {/* Title rail — brand-adjacent, not dashboard chrome */}
      <header className="animate-rise mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--bp-line)] pb-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.26em] text-river">
            Beaver Plan · {trip.destination ?? t(locale, "planner.trip")}
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-bold tracking-tight text-ink md:text-5xl">
            {trip.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <OfflinePinControl
            tripId={tripId}
            locale={locale}
            trip={trip}
            days={days}
            stops={stops}
            legs={legs}
            compact
          />
          <Link
            href={`/trips/${tripId}/journal`}
            className="px-3 py-1.5 text-ink-soft underline-offset-4 transition hover:text-river hover:underline"
          >
            {t(locale, "nav.journal")}
          </Link>
          <Link
            href={`/trips/${tripId}/share`}
            className="rounded-bp bg-timber px-3.5 py-1.5 font-semibold text-foam transition hover:brightness-110"
          >
            {t(locale, "nav.share")}
          </Link>
          <label className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-ink-soft">
            <input
              type="checkbox"
              checked={copyJournal}
              onChange={(e) => setCopyJournal(e.target.checked)}
              className="accent-[color:var(--bp-river)]"
            />
            <span className="hidden sm:inline">
              {t(locale, "planner.copyJournal")}
            </span>
          </label>
          <button
            type="button"
            disabled={duplicating}
            onClick={() => void duplicateTrip()}
            className="px-3 py-1.5 text-ink-soft transition hover:text-river disabled:opacity-40"
          >
            {duplicating
              ? t(locale, "planner.duplicating")
              : t(locale, "planner.duplicate")}
          </button>
          <div className="ml-1 flex overflow-hidden rounded-bp border border-[color:var(--bp-line)]">
            {(["auto", "google", "amap", "baidu"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => void setEnginePreference(opt)}
                className={`px-2.5 py-1.5 text-xs font-medium transition ${
                  preference === opt
                    ? "bg-ink text-foam"
                    : "bg-foam/40 text-ink-soft hover:text-river"
                }`}
              >
                {t(locale, `planner.pref.${opt}`)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TripMembersBar
          tripId={tripId}
          locale={locale}
          tripVersion={trip.version}
          onVersion={(v) =>
            setTrip((prev) => (prev ? { ...prev, version: v } : prev))
          }
        />
      </div>

      {/* One composition: map stage + itinerary column */}
      <div className="grid gap-0 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam/40 shadow-bp lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.9fr)] lg:min-h-[640px]">
        <section className="relative flex min-h-[420px] flex-col">
          <div
            className="animate-fade min-h-0 flex-1"
            style={{ animationDelay: "60ms" }}
          >
            <MapStage
              stops={dayStops}
              legs={dayLegs}
              selectedStopId={selectedStopId}
              onSelectStop={setSelectedStopId}
              engineLabel={engineLabel}
              modeLabel={modeLabel}
              locale={locale}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--bp-line)] bg-foam/80 px-4 py-3 backdrop-blur-sm">
            <div className="flex overflow-hidden rounded-bp border border-[color:var(--bp-line)]">
              {(["walk", "transit", "drive"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTravelMode(m)}
                  className={`px-3 py-1.5 text-sm font-medium transition ${
                    travelMode === m
                      ? "bg-river text-foam"
                      : "text-ink-soft hover:text-river"
                  }`}
                >
                  {t(locale, `planner.mode.${m}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={routing || dayStops.length < 2}
              onClick={() => void generateRoutes()}
              className="rounded-bp bg-ink px-4 py-2 text-sm font-semibold text-foam transition hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {routing
                ? t(locale, "planner.routing")
                : t(locale, "planner.generateRoutes")}
            </button>
            {dayLegs.length > 0 && (
              <p className="text-sm text-ink-soft">
                {dayLegs
                  .map(
                    (l) =>
                      `${formatDuration(l.durationSec)} · ${formatDistance(l.distanceM)}`,
                  )
                  .join("  →  ")}
              </p>
            )}
            {dayLegs.some((l) => l.transitSteps.length > 1) && (
              <p className="text-xs text-river">
                {t(locale, "planner.transfer.hint")}
              </p>
            )}
          </div>
        </section>

        <aside
          className="animate-sheet-in flex flex-col border-t border-[color:var(--bp-line)] bg-paper/90 lg:border-l lg:border-t-0"
          style={{ animationDelay: "100ms" }}
        >
          <div className="flex gap-0 overflow-x-auto border-b border-[color:var(--bp-line)]">
            {days.map((day, i) => (
              <button
                key={day.id}
                type="button"
                onClick={() => {
                  setDayId(day.id);
                  setSelectedStopId(null);
                }}
                className={`shrink-0 px-5 py-3.5 text-left transition ${
                  dayId === day.id
                    ? "bg-ink text-foam"
                    : "text-ink-soft hover:bg-mist/40 hover:text-ink"
                }`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
                  {t(locale, "planner.day")} {i + 1}
                </div>
                <div className="mt-0.5 text-sm font-semibold">{day.date}</div>
              </button>
            ))}
          </div>

          <div className="relative border-b border-[color:var(--bp-line)] px-4 py-3">
            <label className="sr-only" htmlFor="poi-search">
              {t(locale, "planner.search")}
            </label>
            <input
              id="poi-search"
              value={query}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                void runSearch(v);
              }}
              placeholder={t(locale, "planner.searchPlaceholder")}
              className="w-full border-0 bg-transparent px-1 py-2 text-sm text-ink outline-none ring-0 placeholder:text-ink-soft/45 focus:outline-none"
            />
            {searching && (
              <span className="absolute right-4 top-4 text-xs text-ink-soft">
                …
              </span>
            )}
            {results.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-20 max-h-64 overflow-auto border border-[color:var(--bp-line)] bg-foam shadow-bp">
                {results.map((place) => (
                  <li key={place.enginePlaceId}>
                    <button
                      type="button"
                      onClick={() => void addPlace(place)}
                      className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition hover:bg-mist/60"
                    >
                      <span className="text-sm font-medium text-ink">
                        {place.name}
                      </span>
                      {place.address && (
                        <span className="text-xs text-ink-soft">
                          {place.address}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ol className="flex-1 overflow-y-auto">
            {dayStops.length === 0 && (
              <li className="animate-fade px-5 py-12">
                <p className="font-display text-2xl font-semibold text-ink">
                  {t(locale, "planner.emptyDay")}
                </p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
                  {t(locale, "planner.emptyDayHint")}
                </p>
              </li>
            )}
            {dayStops.map((stop, index) => {
              const selected = selectedStopId === stop.id;
              const leg = dayLegs.find((l) => l.fromStopId === stop.id);
              return (
                <li key={stop.id} className="border-b border-[color:var(--bp-line)]">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedStopId(stop.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedStopId(stop.id);
                      }
                    }}
                    className={`group flex gap-3 px-4 py-4 transition duration-bp-fast ease-bp-out ${
                      selected
                        ? "animate-stop-select"
                        : "hover:bg-mist/30"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold ${
                        selected
                          ? "bg-timber text-foam"
                          : "bg-ink text-foam"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-ink">
                        {stop.place.name}
                      </div>
                      {stop.place.address && (
                        <div className="mt-0.5 truncate text-xs text-ink-soft">
                          {stop.place.address}
                        </div>
                      )}
                      {leg && (
                        <>
                          <div className="mt-2 text-xs font-medium text-river">
                            → {summarizeTransfer(leg)}
                          </div>
                          {(leg.mode === "transit" ||
                            leg.transitSteps.length > 1) && (
                            <TransferSteps
                              leg={leg}
                              locale={locale}
                              variant="inline"
                            />
                          )}
                        </>
                      )}
                      <BookingLinkChips
                        links={stop.bookingLinks}
                        locale={locale}
                      />
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 opacity-50 transition group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label="Move up"
                        className="px-1 text-ink-soft hover:text-river"
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveStop(stop.id, -1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        className="px-1 text-ink-soft hover:text-river"
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveStop(stop.id, 1);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label="Remove"
                        className="px-1 text-ink-soft hover:text-timber"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeStop(stop.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {error && (
            <p className="px-4 py-2 text-sm text-timber" role="alert">
              {error}
            </p>
          )}
          <p className="border-t border-[color:var(--bp-line)] px-4 py-3 text-xs leading-relaxed text-ink-soft/75">
            {t(locale, "planner.hint")}
          </p>
        </aside>
      </div>

      {/* Secondary tools — below the composition, not card soup in the hero */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <DayFillPanel
          tripId={tripId}
          locale={locale}
          trip={trip}
          dayCountHint={days.length || 3}
          onApplied={async () => {
            await refresh();
          }}
          onError={(message) => setError(message || null)}
        />
        <BookingPanel
          tripId={tripId}
          locale={locale}
          trip={trip}
          stop={dayStops.find((s) => s.id === selectedStopId) ?? null}
          destinationHint={trip.destination}
          onSaved={async () => {
            await refresh();
          }}
          onError={(message) => setError(message || null)}
        />
      </div>

      <div className="mt-6">
        <TripCollabPanel
          tripId={tripId}
          locale={locale}
          selectedStopId={selectedStopId}
          selectedStopName={
            dayStops.find((s) => s.id === selectedStopId)?.place.name
          }
        />
      </div>
    </div>
  );
}
