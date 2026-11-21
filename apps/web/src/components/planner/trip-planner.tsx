"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Day,
  Leg,
  MapEngineId,
  PlaceDetails,
  PlaceSummary,
  Stop,
  Trip,
} from "@beaver/core";
import {
  DEMO_PLACE_TAGS,
  DemoRoutingEngine,
  formatDistance,
  formatDuration,
  getDemoPlaceDetails,
  reorderStops as reorderStopsLocal,
  routeAdjacentStops,
  searchDemoPlaces,
  stopsForDay,
  summarizeTransfer,
  toPlaceRef,
} from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
import { getLocalTrip, saveLocalTrip } from "@/lib/local-trips";
import { TripCollabPanel } from "@/components/collab/trip-collab-panel";
import { TripMembersBar } from "@/components/collab/trip-members";
import { OfflinePinControl } from "@/components/offline/offline-pin-control";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { PlannerSkeleton } from "@/components/ui/skeleton";
import { BookingLinkChips, BookingPanel } from "./booking-panel";
import { DayFillPanel } from "./day-fill-panel";
import { MapStage } from "./map-stage";
import { PlaceIntel } from "./place-intel";
import { StopReorderList } from "./stop-reorder-list";
import { TransferSteps } from "./transfer-steps";

type PlaceDetailsResponse = {
  place: PlaceDetails;
  engineId: MapEngineId;
  mode: "live" | "demo";
};

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

const SEARCH_DEBOUNCE_MS = 220;

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
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [placeDetailsMode, setPlaceDetailsMode] = useState<"live" | "demo">(
    "demo",
  );
  const [placeDetailsLoading, setPlaceDetailsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [engineInfo, setEngineInfo] = useState<EngineResponse | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("transit");
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [duplicating, setDuplicating] = useState(false);
  const [copyJournal, setCopyJournal] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);
  const dayTabsRef = useRef<HTMLDivElement | null>(null);
  const dayTabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [dayTabIndicator, setDayTabIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  const preference = trip?.mapEngine ?? "auto";

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );

  const dayLegs = useMemo(() => {
    const ids = new Set(dayStops.map((s) => s.id));
    return legs.filter((l) => ids.has(l.fromStopId) && ids.has(l.toStopId));
  }, [legs, dayStops]);

  useEffect(() => {
    if (!dayId) {
      setDayTabIndicator(null);
      return;
    }
    const measure = () => {
      const tab = dayTabRefs.current.get(dayId);
      if (!tab) return;
      setDayTabIndicator({
        left: tab.offsetLeft,
        width: tab.offsetWidth,
      });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [dayId, days]);

  const applySoftOrHard = useCallback((err: unknown, hardFallback: string) => {
    if (isPlannerNoiseError(err)) {
      setSoftNotice(t(locale, "planner.demoLocal"));
      setError(null);
      return true;
    }
    setSoftNotice(null);
    setError(err instanceof Error ? err.message : hardFallback);
    return false;
  }, [locale]);

  const applyLocalBundle = useCallback(() => {
    const local = getLocalTrip(tripId);
    if (!local) return null;
    setTrip(local.trip);
    setDays(local.days);
    setStops(local.stops);
    setLegs(local.legs);
    setDayId((prev) => prev ?? local.days[0]?.id ?? null);
    setSoftNotice(t(locale, "planner.demoLocal"));
    setError(null);
    return {
      trip: local.trip,
      days: local.days,
      stops: local.stops,
      legs: local.legs,
    } satisfies TripPayload;
  }, [tripId, locale]);

  const refresh = useCallback(async (): Promise<TripPayload | null> => {
    try {
      const data = await apiGet<TripPayload>(`/v1/trips/${tripId}`);
      setTrip(data.trip);
      setDays(data.days);
      setStops(data.stops);
      setLegs(data.legs);
      setDayId((prev) => prev ?? data.days[0]?.id ?? null);
      setSoftNotice(null);
      return data;
    } catch (e) {
      const local = applyLocalBundle();
      if (local) return local;
      if (isPlannerNoiseError(e)) {
        setSoftNotice(t(locale, "planner.demoLocal"));
        return null;
      }
      throw e;
    }
  }, [tripId, locale, applyLocalBundle]);

  useEffect(() => {
    if (initial) return;
    // Local optimistic trips only live in the browser — hydrate before fetch.
    if (applyLocalBundle()) return;
    startTransition(() => {
      void refresh().catch((e: Error) => {
        if (isPlannerNoiseError(e)) {
          setSoftNotice(t(locale, "planner.demoLocal"));
          setError(null);
          return;
        }
        setError(e.message);
      });
    });
  }, [initial, refresh, applyLocalBundle, locale]);
  useEffect(() => {
    void apiGet<EngineResponse>(
      `/v1/maps/engine?preference=${encodeURIComponent(preference)}&timezone=${encodeURIComponent(trip?.timezone ?? "")}`,
    )
      .then((info) => {
        setEngineInfo(info);
        if (info.mode === "demo") {
          setSoftNotice((prev) => prev ?? t(locale, "planner.transfer.demoNotice"));
        }
      })
      .catch(() => {
        // Keys/API absent — treat as demo shell; mute timber noise.
        setEngineInfo(null);
        setSoftNotice((prev) => prev ?? t(locale, "planner.transfer.demoNotice"));
        setError(null);
      });
  }, [preference, trip?.timezone, locale]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Soft-fetch Places intel for the selected stop; demo fixtures when offline.
  useEffect(() => {
    if (!selectedStopId) {
      setPlaceDetails(null);
      setPlaceDetailsLoading(false);
      return;
    }
    const stop = stops.find((s) => s.id === selectedStopId);
    if (!stop) {
      setPlaceDetails(null);
      return;
    }
    const placeId = stop.place.enginePlaceId;
    let cancelled = false;
    setPlaceDetailsLoading(true);
    // Paint curated intel immediately so the card never flashes empty.
    setPlaceDetails(
      getDemoPlaceDetails(placeId, locale, DEMO_PLACE_TAGS[placeId]),
    );
    setPlaceDetailsMode("demo");

    const params = new URLSearchParams({
      engine: preference,
      language: locale,
    });
    if (trip?.timezone) params.set("timezone", trip.timezone);

    void apiGet<PlaceDetailsResponse>(`/v1/places/${encodeURIComponent(placeId)}?${params}`)
      .then((data) => {
        if (cancelled) return;
        setPlaceDetails(data.place);
        setPlaceDetailsMode(data.mode);
      })
      .catch((e) => {
        if (cancelled) return;
        // Keep demo intel; soft-notice only for unexpected noise.
        setPlaceDetails(
          getDemoPlaceDetails(placeId, locale, DEMO_PLACE_TAGS[placeId]),
        );
        setPlaceDetailsMode("demo");
        if (isPlannerNoiseError(e)) {
          setSoftNotice(t(locale, "planner.demoLocal"));
          setError(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPlaceDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStopId, stops, locale, preference, trip?.timezone]);

  const applySearchResults = useCallback(
    (places: PlaceSummary[], meta?: Partial<SearchResponse>) => {
      setResults(places);
      if (meta?.engineId) {
        setEngineInfo((prev) =>
          prev
            ? {
                ...prev,
                engineId: meta.engineId!,
                mode: meta.mode ?? prev.mode,
                region: meta.region ?? prev.region,
              }
            : {
                preference,
                engineId: meta.engineId!,
                mode: meta.mode ?? "demo",
                region: meta.region ?? "other",
              },
        );
      }
    },
    [preference],
  );

  async function runSearch(text: string) {
    const q = text.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const gen = ++searchGenRef.current;
    // Instant curated fixtures so the dropdown is never an empty stub.
    applySearchResults(searchDemoPlaces(q), {
      engineId: engineInfo?.engineId ?? "google",
      mode: "demo",
      region: engineInfo?.region ?? "other",
    });
    setSearching(true);
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
      if (gen !== searchGenRef.current) return;
      if (data.places.length > 0) {
        applySearchResults(data.places, data);
      }
    } catch (e) {
      if (gen !== searchGenRef.current) return;
      if (isPlannerNoiseError(e)) {
        setSoftNotice(t(locale, "planner.searchDemo"));
        setError(null);
      } else {
        applySoftOrHard(e, "search_failed");
      }
    } finally {
      if (gen === searchGenRef.current) setSearching(false);
    }
  }

  function scheduleSearch(text: string) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = text.trim();
    // Paint local hits immediately; debounce only the live BFF round-trip.
    if (q) {
      applySearchResults(searchDemoPlaces(q), {
        engineId: engineInfo?.engineId ?? "google",
        mode: "demo",
        region: engineInfo?.region ?? "other",
      });
    } else {
      setResults([]);
    }
    searchTimerRef.current = setTimeout(() => {
      void runSearch(text);
    }, SEARCH_DEBOUNCE_MS);
  }

  async function routeDayStops(
    activeDayId: string,
    orderedStops: Stop[],
  ): Promise<void> {
    if (orderedStops.length < 2) {
      setLegs((prev) => {
        const ids = new Set(orderedStops.map((s) => s.id));
        return prev.filter(
          (l) => !(ids.has(l.fromStopId) || ids.has(l.toStopId)),
        );
      });
      return;
    }
    setRouting(true);
    setError(null);
    try {
      const res = await apiSend<{
        legs: Leg[];
        mode: "live" | "demo";
        engineId: MapEngineId;
      }>(`/v1/trips/${tripId}/route-day`, "POST", {
        dayId: activeDayId,
        mode: travelMode,
        engine: preference,
      });
      setLegs((prev) => {
        const ids = new Set(orderedStops.map((s) => s.id));
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
      // Soft muted notice when Directions keys absent — never timber noise.
      if (res.mode === "demo") {
        setSoftNotice(t(locale, "planner.transfer.demoNotice"));
      } else {
        setSoftNotice(null);
      }
    } catch (e) {
      // Client-side demo transit when Neon/API/keys are down.
      const engineId = engineInfo?.engineId ?? "google";
      const routingEngine = new DemoRoutingEngine(engineId);
      const demoLegs = await routeAdjacentStops(
        routingEngine,
        orderedStops,
        travelMode,
        locale,
      );
      setLegs((prev) => {
        const ids = new Set(orderedStops.map((s) => s.id));
        const kept = prev.filter(
          (l) => !(ids.has(l.fromStopId) && ids.has(l.toStopId)),
        );
        return [...kept, ...demoLegs];
      });
      setEngineInfo((prev) =>
        prev
          ? { ...prev, engineId, mode: "demo" }
          : { preference, engineId, mode: "demo", region: "other" },
      );
      // Always soft-fail routing — demo legs already painted; no Failed to fetch.
      setSoftNotice(t(locale, "planner.transfer.demoNotice"));
      setError(null);
      void e;
    } finally {
      setRouting(false);
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
      const payload = await refresh();
      const nextStops = payload?.stops ?? stops;
      const ordered = stopsForDay(nextStops, dayId);
      await routeDayStops(dayId, ordered);
    } catch (e) {
      // Local optimistic add so sample-kyoto / offline shell stays usable.
      const engineId = engineInfo?.engineId ?? "google";
      const stop: Stop = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `local-stop-${Date.now()}`,
        dayId,
        order: dayStops.length,
        place: toPlaceRef(engineId, place),
        photos: [],
        bookingLinks: [],
      };
      const nextStops = [...stops, stop];
      const nextTrip = trip
        ? { ...trip, version: trip.version + 1, updatedAt: new Date().toISOString() }
        : null;
      setStops(nextStops);
      if (nextTrip) setTrip(nextTrip);
      if (nextTrip && getLocalTrip(tripId)) {
        saveLocalTrip({
          trip: nextTrip,
          days,
          stops: nextStops,
          legs,
          local: true,
        });
      }
      setQuery("");
      setResults([]);
      setSelectedStopId(stop.id);
      if (isPlannerNoiseError(e)) {
        setSoftNotice(t(locale, "planner.demoLocal"));
        setError(null);
      } else {
        applySoftOrHard(e, "add_failed");
      }
      await routeDayStops(dayId, stopsForDay(nextStops, dayId));
    }
  }

  async function removeStop(stopId: string) {
    if (!trip || !dayId) return;
    setError(null);
    try {
      await apiSend(`/v1/trips/${tripId}/stops/${stopId}`, "DELETE", {
        expectedVersion: trip.version,
      });
      if (selectedStopId === stopId) setSelectedStopId(null);
      const payload = await refresh();
      const ordered = stopsForDay(payload?.stops ?? stops, dayId);
      await routeDayStops(dayId, ordered);
    } catch (e) {
      const nextStops = stops.filter((s) => s.id !== stopId);
      setStops(nextStops);
      setLegs((prev) =>
        prev.filter((l) => l.fromStopId !== stopId && l.toStopId !== stopId),
      );
      if (selectedStopId === stopId) setSelectedStopId(null);
      setTrip((prev) =>
        prev ? { ...prev, version: prev.version + 1 } : prev,
      );
      applySoftOrHard(e, "delete_failed");
      await routeDayStops(dayId, stopsForDay(nextStops, dayId));
    }
  }

  async function commitStopOrder(orderedIds: string[]) {
    if (!dayId || !trip) return;
    const current = dayStops.map((s) => s.id);
    if (
      orderedIds.length !== current.length ||
      orderedIds.every((id, i) => id === current[i])
    ) {
      return;
    }

    // Optimistic local reorder so the list settles immediately (tip 005 drop).
    const nextStops = reorderStopsLocal(stops, dayId, orderedIds);
    setStops(nextStops);
    const nextTrip = trip
      ? { ...trip, version: trip.version + 1 }
      : trip;
    if (nextTrip) {
      setTrip(nextTrip);
      if (getLocalTrip(tripId)) {
        saveLocalTrip({
          trip: nextTrip,
          days,
          stops: nextStops,
          legs,
          local: true,
        });
      }
    }

    try {
      await apiSend(`/v1/trips/${tripId}/stops/reorder`, "PATCH", {
        dayId,
        orderedIds,
        expectedVersion: trip.version,
      });
      const payload = await refresh();
      await routeDayStops(
        dayId,
        stopsForDay(payload?.stops ?? nextStops, dayId),
      );
    } catch (e) {
      // Soft-fail: keep optimistic order when API is down.
      applySoftOrHard(e, "reorder_failed");
      await routeDayStops(dayId, stopsForDay(nextStops, dayId));
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
    await commitStopOrder(swapped);
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
      if (isPlannerNoiseError(e)) {
        // Keep preference local for the demo shell.
        setTrip((prev) => (prev ? { ...prev, mapEngine: next } : prev));
        setSoftNotice(t(locale, "planner.demoLocal"));
        setError(null);
        return;
      }
      setError(e instanceof Error ? e.message : "engine_failed");
    }
  }

  async function generateRoutes() {
    if (!dayId) return;
    setError(null);
    await routeDayStops(dayId, dayStops);
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
      applySoftOrHard(e, "duplicate_failed");
      setDuplicating(false);
    }
  }

  if (!trip && pending) {
    return <PlannerSkeleton />;
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
          <h1
            className="bp-vt-trip-title mt-1.5 font-display text-3xl font-bold tracking-tight text-ink md:text-5xl"
            style={{ viewTransitionName: `bp-trip-${trip.id}` }}
          >
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
            className="rounded-bp bg-river px-3.5 py-1.5 font-semibold text-foam transition hover:bg-river-deep"
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
                className={`px-2.5 py-1.5 text-xs font-semibold transition duration-bp-fast ease-bp ${
                  preference === opt
                    ? "bg-river text-foam"
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

      {/* One composition: light map stage + itinerary sheet */}
      <div className="grid gap-0 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam shadow-bp lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.9fr)] lg:min-h-[640px]">
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
              engineId={engineInfo?.engineId}
              mode={engineInfo?.mode ?? "demo"}
              locale={locale}
              query={query}
              results={results}
              searching={searching}
              onQueryChange={(v) => {
                setQuery(v);
                scheduleSearch(v);
              }}
              onSearchCommit={(v) => {
                setQuery(v);
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                void runSearch(v);
              }}
              onPickPlace={(place) => void addPlace(place)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--bp-line)] bg-foam/95 px-4 py-3 backdrop-blur-sm">
            <div className="flex overflow-hidden rounded-bp border border-[color:var(--bp-line)]">
              {(["walk", "transit", "drive"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTravelMode(m)}
                  className={`px-3 py-1.5 text-sm font-medium transition duration-bp-fast ease-bp-out ${
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
              className="rounded-bp bg-ink px-4 py-2 text-sm font-semibold text-foam transition duration-bp ease-bp hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {routing
                ? t(locale, "planner.routing")
                : t(locale, "planner.generateRoutes")}
            </button>
            {dayLegs.length > 0 && (
              <p className="text-sm tabular-nums text-ink-soft">
                {dayLegs
                  .map(
                    (l) =>
                      `${formatDuration(l.durationSec)} · ${formatDistance(l.distanceM)}`,
                  )
                  .join("  →  ")}
              </p>
            )}
            {engineInfo?.mode !== "live" && dayLegs.length > 0 && (
              <span className="rounded-bp-xs bg-river/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-river/80">
                {t(locale, "planner.transfer.demoBadge")}
              </span>
            )}
          </div>
        </section>

        <aside
          className="animate-sheet-in flex flex-col border-t border-[color:var(--bp-line)] bg-foam lg:border-l lg:border-t-0"
          style={{ animationDelay: "100ms" }}
        >
          <div
            ref={dayTabsRef}
            className="relative flex gap-0 overflow-x-auto border-b border-[color:var(--bp-line)] bg-paper/60"
          >
            {/* Tip 015 — sliding day indicator (pattern g) */}
            {dayTabIndicator && (
              <span
                aria-hidden
                className="animate-tab-indicator pointer-events-none absolute inset-y-0 z-0 bg-river"
                style={{
                  left: dayTabIndicator.left,
                  width: dayTabIndicator.width,
                }}
              />
            )}
            {days.map((day, i) => {
              const active = dayId === day.id;
              return (
                <button
                  key={day.id}
                  type="button"
                  ref={(el) => {
                    if (el) dayTabRefs.current.set(day.id, el);
                    else dayTabRefs.current.delete(day.id);
                  }}
                  onClick={() => {
                    setDayId(day.id);
                    setSelectedStopId(null);
                  }}
                  className={`relative z-[1] shrink-0 px-5 py-3.5 text-left transition duration-bp-fast ease-bp-out ${
                    active
                      ? "text-foam"
                      : "text-ink-soft hover:bg-mist/70 hover:text-ink"
                  }`}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
                    {t(locale, "planner.day")} {i + 1}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold">{day.date}</div>
                </button>
              );
            })}
          </div>

          <StopReorderList
            items={dayStops}
            onReorder={(orderedIds) => {
              void commitStopOrder(orderedIds);
            }}
            label={t(locale, "planner.stopsList")}
            dragHandleLabel={t(locale, "planner.dragReorder")}
            empty={
              <li className="animate-fade list-none px-5 py-12">
                <p className="font-display text-2xl font-semibold text-ink">
                  {t(locale, "planner.emptyDay")}
                </p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
                  {t(locale, "planner.emptyDayHint")}
                </p>
              </li>
            }
            renderItem={(stop, ctx) => {
              const selected = selectedStopId === stop.id;
              const leg = dayLegs.find((l) => l.fromStopId === stop.id);
              return (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (ctx.isDragging) return;
                    setSelectedStopId(stop.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedStopId(stop.id);
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      void moveStop(stop.id, -1);
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      void moveStop(stop.id, 1);
                    }
                  }}
                  className={`group flex gap-2 px-3 py-4 transition duration-bp-fast ease-bp-out sm:gap-3 sm:px-4 ${
                    selected
                      ? "animate-stop-select"
                      : "hover:bg-mist/30"
                  }`}
                >
                  <button
                    type="button"
                    {...ctx.dragHandleProps}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span aria-hidden className="flex flex-col gap-[3px]">
                      <span className="block h-0.5 w-3 rounded-full bg-current" />
                      <span className="block h-0.5 w-3 rounded-full bg-current" />
                      <span className="block h-0.5 w-3 rounded-full bg-current" />
                    </span>
                  </button>
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-bp text-xs font-bold ${
                      selected
                        ? "bg-river text-foam"
                        : "bg-ink text-foam"
                    }`}
                  >
                    {ctx.index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-ink ${
                        selected
                          ? "font-display text-base font-bold tracking-tight"
                          : "font-semibold"
                      }`}
                    >
                      {stop.place.name}
                    </div>
                    {stop.place.address && (
                      <div className="mt-0.5 truncate text-xs text-ink-soft">
                        {stop.place.address}
                      </div>
                    )}
                    {selected && (
                      <PlaceIntel
                        details={
                          placeDetails?.enginePlaceId ===
                          stop.place.enginePlaceId
                            ? placeDetails
                            : null
                        }
                        loading={placeDetailsLoading}
                        locale={locale}
                        demoMode={placeDetailsMode === "demo"}
                        userNote={stop.userNote}
                      />
                    )}
                    {leg && (
                      <>
                        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-river">
                            {leg.mode === "transit"
                              ? t(locale, "planner.mode.transit")
                              : leg.mode === "walk"
                                ? t(locale, "planner.mode.walk")
                                : t(locale, "planner.mode.drive")}
                          </span>
                          <span className="text-xs font-medium text-ink">
                            {summarizeTransfer(leg)}
                          </span>
                        </div>
                        {(leg.mode === "transit" ||
                          leg.transitSteps.length > 1) && (
                          <TransferSteps
                            leg={leg}
                            locale={locale}
                            variant="inline"
                            demoMode={engineInfo?.mode !== "live"}
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
                      aria-label={t(locale, "planner.moveUp")}
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
                      aria-label={t(locale, "planner.moveDown")}
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
                      aria-label={t(locale, "planner.removeStop")}
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
              );
            }}
          />

          {error && !isPlannerNoiseError(new Error(error)) && (
            <p className="px-4 py-2 text-sm text-timber" role="alert">
              {error}
            </p>
          )}
{(softNotice ||
            (error && isPlannerNoiseError(new Error(error)))) && (
            <SoftFailNotice compact>
              {softNotice ?? t(locale, "planner.transfer.demoNotice")}
            </SoftFailNotice>
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
          days={days}
          stops={stops}
          dayCountHint={days.length || 3}
          onApplied={async () => {
            await refresh();
          }}
          onLocalApplied={({ trip: nextTrip, days: nextDays, stops: nextStops }) => {
            setTrip(nextTrip);
            setDays(nextDays);
            setStops(nextStops);
            setLegs([]);
            setDayId(nextDays[0]?.id ?? null);
            setSelectedStopId(null);
            setSoftNotice(t(locale, "planner.dayFill.appliedLocal"));
            setError(null);
          }}
          onError={(message) => {
            if (!message) {
              setError(null);
              return;
            }
            if (isPlannerNoiseError(new Error(message))) {
              setSoftNotice(t(locale, "planner.demoLocal"));
              setError(null);
              return;
            }
            setError(message);
          }}
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
          onError={(message) => {
            if (!message) {
              setError(null);
              return;
            }
            if (isPlannerNoiseError(new Error(message))) {
              setSoftNotice(t(locale, "planner.demoLocal"));
              setError(null);
              return;
            }
            setError(message);
          }}
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
