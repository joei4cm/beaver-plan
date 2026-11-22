"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
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
  toPlaceRef,
} from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
import { getLocalTrip, saveLocalTrip } from "@/lib/local-trips";
import { TripCollabPanel } from "@/components/collab/trip-collab-panel";
import { TripMembersBar } from "@/components/collab/trip-members";
import { OfflinePinControl } from "@/components/offline/offline-pin-control";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashClass,
  softFailRailClass,
} from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
import {
  PlannerSkeleton,
  TransferStepsSkeleton,
} from "@/components/ui/skeleton";
import { BookingLinkChips, BookingPanel } from "./booking-panel";
import { DayFillPanel } from "./day-fill-panel";
import { DayTimelineScrub } from "./day-timeline-scrub";
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
  /** SoftFail yield (BEA-379): invite sheet owns SoftFail → panel/timeline yield. */
  const [collabInviteOpen, setCollabInviteOpen] = useState(false);
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
  /** Craft preview: /trips/…?dragSoftFail=1 — SoftFail depth under Stops without a reorder. */
  const [dragSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("dragSoftFail") === "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…?stopsSoftFail=1 — SoftFail depth under stop chips. */
  const [stopsSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("stopsSoftFail") === "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…?modeSoftFail=1 — SoftFail depth under Mode rail (BEA-423). */
  const [modeSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("modeSoftFail") === "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…?transferSoftFail=1 — SoftFail depth under Transfer (BEA-423). */
  const [transferSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("transferSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…?shareSoftFail=1 — SoftFail depth under Export (BEA-429). */
  const [shareSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("shareSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…?emptySoftFail=1 — SoftFail depth under empty Stops (BEA-429). */
  const [emptySoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("emptySoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
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
  /** Replays tip-011 underline settle without remounting (keeps tip-015 stretch). */
  const [dayTabSettleOn, setDayTabSettleOn] = useState(true);

  const preference = trip?.mapEngine ?? "auto";

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );

  /** Per-day stop counts for day-tab meta (BEA-247 chrome). */
  const dayStopCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of days) {
      map.set(day.id, stopsForDay(stops, day.id).length);
    }
    return map;
  }, [days, stops]);

  const dayLegs = useMemo(() => {
    const ids = new Set(dayStops.map((s) => s.id));
    return legs.filter((l) => ids.has(l.fromStopId) && ids.has(l.toStopId));
  }, [legs, dayStops]);

  const dayEmpty = dayStops.length === 0;
  const demoShell = engineInfo?.mode !== "live";
  const plannerNoise = Boolean(
    error && isPlannerNoiseError(new Error(error)),
  );
  /**
   * SoftFailNotice depth ownership (BEA-367 stop chips / BEA-343 drawer /
   * BEA-348 drag / BEA-355 empty / BEA-362 share CTA;
   * SoftFailBadge / SoftFailSupport helpers BEA-387 after #284):
   * Empty SoftFail depth (BEA-355 after #122) under Stops when the day is empty —
   * Soft empty badge · softSupport · tip-011 mist-wash empty body.
   * Drag SoftFail under Stops when softNotice / dragSoftPreview (BEA-348) —
   * Soft reorder badge · softSupport · tip-011 mist-wash · stop-drawer SoftFail
   * (#257) and day-fill SoftFail (#248) yield (no double depth).
   * Stop chips SoftFail depth (BEA-367 after #137) under Stops when the day has
   * stops and SoftFail is open — Soft stops badge · softSupport · tip-011
   * mist-wash chips. Stop-drawer SoftFail (#257) / drag SoftFail (#263) /
   * empty SoftFail (#267) yield if overlapping (no double depth).
   * Otherwise Itinerary owns SoftFail (BEA-343) when chips SoftFail is closed.
   * Title Export SoftFail depth (BEA-362 after #121) owns SoftFail under the
   * azure Export rail independently (different rail) — Soft share badge ·
   * softSupport · tip-011 mist-wash CTA. Yields share export SoftFail (#255) /
   * share studio SoftFail (#243) on /share (no double depth). Soft copy never
   * timber / Failed to fetch.
   */
  const emptyOwnsSoft = dayEmpty;
  const dragSoftFailCopy = t(locale, "planner.stops.dragSoftFail");
  const dragOwnsSoft =
    !dayEmpty &&
    (dragSoftPreview || softNotice === dragSoftFailCopy);
  /**
   * Stop chips SoftFailNotice depth (BEA-367 after #137 / BEA-176):
   * azure Stops rail · Soft stops badge · softSupport · compact SoftFail mist
   * band · tip-011 mist-wash chips. Yields while empty SoftFail (#267) or drag
   * SoftFail (#263) own Stops; stop-drawer SoftFail (#257) yields while chips
   * SoftFail owns (no double depth). SoftFail copy always stops.softFail —
   * never timber / Failed to fetch. Expo trip-detail SoftFail (#229) stays out
   * of scope.
   */
  const chipsOwnsSoft = !dayEmpty && !dragOwnsSoft;
  const chipsSoftOpen =
    chipsOwnsSoft &&
    Boolean(
      stopsSoftPreview ||
        plannerNoise ||
        (demoShell && (dayLegs.length > 0 || dayStops.length > 0)),
    );
  const drawerOwnsSoft = !dayEmpty && !dragOwnsSoft && !chipsSoftOpen;
  const drawerSoftOpen =
    drawerOwnsSoft &&
    Boolean(
      plannerNoise ||
        (demoShell && (dayLegs.length > 0 || dayStops.length > 0)),
    );
  const drawerSoftCopy = t(locale, "planner.drawer.softFail");
  const drawerSupportCopy = drawerSoftOpen
    ? t(locale, "planner.drawer.softSupport")
    : t(locale, "planner.drawer.support");
  /**
   * Empty SoftFailNotice depth (BEA-355 after #122 / BEA-222) + craft SoftFail
   * query residual (BEA-429): azure Stops rail · Soft empty badge · softSupport ·
   * compact SoftFail mist band · tip-011 mist-wash empty body. Craft:
   * `/trips/…?emptySoftFail=1` forces SoftFail under empty Stops. Yields to
   * drawer SoftFail (#257), day-fill SoftFail (#248), drag SoftFail (BEA-348),
   * and stop chips SoftFail (BEA-367) — no double depth. SoftFail copy always
   * emptySoftFail (never inherit transfer / drag timber). Journal empty SoftFail
   * craft stays on /journal (BEA-428).
   */
  const listSoftOpen = emptyOwnsSoft
    ? Boolean(emptySoftPreview || softNotice || plannerNoise || demoShell)
    : dragOwnsSoft
      ? true
      : chipsSoftOpen;
  const emptySoftOpen = emptyOwnsSoft && listSoftOpen;
  const stopsSupportCopy = emptyOwnsSoft
    ? emptySoftOpen
      ? t(locale, "planner.emptySoftSupport")
      : t(locale, "planner.emptySupport")
    : dragOwnsSoft
      ? t(locale, "planner.stops.dragSoftSupport")
      : chipsSoftOpen
        ? t(locale, "planner.stops.softSupport")
        : t(locale, "planner.stops.support");
  /**
   * SoftFailNotice copy ownership:
   * - Empty day → empty SoftFail depth (BEA-355); never borrow transfer /
   *   drawer / day-fill / drag softNotice.
   * - Drag softNotice → Stops SoftFail depth (BEA-348); drawer / day-fill yield.
   * - Else day with stops + SoftFail → stop chips SoftFail depth (BEA-367);
   *   drawer SoftFail (#257) yields. SoftFail copy always stops.softFail.
   * - Else day with stops → SoftFail under Itinerary (BEA-343 depth).
   *   Day-fill SoftFail (#248) stays under Day fill rail. Transfer soft-fail
   *   stays on transit.
   * - Title Export SoftFail depth (BEA-362) always shareSoftFail — never timber.
   */
  const listSoftCopy = emptyOwnsSoft
    ? t(locale, "planner.emptySoftFail")
    : dragOwnsSoft
      ? dragSoftFailCopy
      : t(locale, "planner.stops.softFail");
  /**
   * Share CTA SoftFailNotice depth (BEA-362 after #121) + craft SoftFail query
   * residual (BEA-429): azure Export rail · Soft share badge · softSupport ·
   * compact SoftFail mist band · tip-011 mist-wash CTA. Craft:
   * `/trips/…?shareSoftFail=1` forces SoftFail under Export. Own rail — empty /
   * drawer SoftFails stay under Stops / Itinerary. Yield share export SoftFail
   * (#255) / share studio SoftFail (#243) on /share. SoftFail copy always
   * shareSoftFail.
   */
  const shareSoftOpen = shareSoftPreview || demoShell || plannerNoise;
  const shareSupportCopy = shareSoftOpen
    ? t(locale, "planner.shareSoftSupport")
    : t(locale, "planner.shareSupport");

  /**
   * Transit filters SoftFailNotice depth (BEA-358 after #129 / BEA-170) + craft
   * SoftFail query parity (BEA-423): Mode rail owns SoftFail when demo legs
   * exist / `?modeSoftFail=1` and TransferSteps does not own selected-stop soft
   * chrome. Soft mode badge · softSupport · compact SoftFail mist band
   * (`border-b`) · tip-011 mist-wash. SoftFail yields while TransferSteps
   * SoftFail depth (BEA-378 / #272 yield) / `?transferSoftFail=1` owns (no
   * double depth). Soft copy always mode.softFail — never timber / Failed to
   * fetch. No `/dev` SoftFail gallery.
   */
  const selectedStopIndex = selectedStopId
    ? dayStops.findIndex((s) => s.id === selectedStopId)
    : -1;
  const selectedOutgoingLeg = selectedStopId
    ? dayLegs.find((l) => l.fromStopId === selectedStopId)
    : undefined;
  const transferSurfaceOpen =
    selectedStopIndex >= 0 &&
    (Boolean(selectedOutgoingLeg) ||
      (!routing && selectedStopIndex < dayStops.length - 1));
  const transitSoftOwns =
    transferSurfaceOpen &&
    (transferSoftPreview || demoShell);
  const modeSoftOpen =
    !transitSoftOwns &&
    (modeSoftPreview || (demoShell && dayLegs.length > 0));
  const modeSoftCopy = t(locale, "planner.mode.softFail");
  const modeSupportCopy = modeSoftOpen
    ? t(locale, "planner.mode.softSupport")
    : t(locale, "planner.mode.support");

  useEffect(() => {
    if (!dayId) {
      setDayTabIndicator(null);
      return;
    }
    /* Underline sits inset under the label block (tip 015 stretch). */
    const INSET_X = 10;
    const measure = () => {
      const tab = dayTabRefs.current.get(dayId);
      if (!tab) return;
      const width = Math.max(tab.offsetWidth - INSET_X * 2, 0);
      setDayTabIndicator({
        left: tab.offsetLeft + INSET_X,
        width,
      });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const tab = dayTabRefs.current.get(dayId);
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tab?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      inline: "nearest",
      block: "nearest",
    });
    const rail = dayTabsRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" && rail
        ? new ResizeObserver(measure)
        : null;
    if (rail) ro?.observe(rail);
    window.addEventListener("resize", measure);
    rail?.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      rail?.removeEventListener("scroll", measure);
    };
  }, [dayId, days]);

  const selectDay = useCallback((nextId: string) => {
    setDayId((prev) => {
      if (prev === nextId) return prev;
      return nextId;
    });
    setSelectedStopId(null);
  }, []);

  useEffect(() => {
    if (!dayId) return;
    setDayTabSettleOn(false);
    const frame = requestAnimationFrame(() => setDayTabSettleOn(true));
    return () => cancelAnimationFrame(frame);
  }, [dayId]);

  const onDayTabsKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!days.length || !dayId) return;
      const idx = days.findIndex((d) => d.id === dayId);
      if (idx < 0) return;
      let next = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        next = (idx + 1) % days.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        next = (idx - 1 + days.length) % days.length;
      } else if (e.key === "Home") {
        next = 0;
      } else if (e.key === "End") {
        next = days.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      const id = days[next]?.id;
      if (!id) return;
      selectDay(id);
      requestAnimationFrame(() => {
        dayTabRefs.current.get(id)?.focus();
      });
    },
    [dayId, days, selectDay],
  );

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
      // Soft-fail: keep optimistic order; SoftFailNotice owns drag copy.
      if (isPlannerNoiseError(e)) {
        setSoftNotice(t(locale, "planner.stops.dragSoftFail"));
        setError(null);
      } else {
        applySoftOrHard(e, "reorder_failed");
      }
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
      {/*
        Share CTA SoftFail depth (BEA-362 after #121):
        azure Export rail · Soft share badge · softSupport · compact SoftFail
        mist band · tip-011 mist-wash CTA · Craft: ?shareSoftFail=1 · yield
        share export SoftFail (#255) / share studio SoftFail (#243) on /share —
        never timber / Failed to fetch.
      */}
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
        <div className="flex min-w-0 w-full flex-col overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft sm:max-w-xl sm:w-auto">
          <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                {t(locale, "planner.shareEyebrow")}
              </span>
              <SoftFailSupport>{shareSupportCopy}</SoftFailSupport>
            </div>
            {shareSoftOpen ? (
              <SoftFailBadge>
                {t(locale, "planner.shareSoftBadge")}
              </SoftFailBadge>
            ) : (
              <SoftFailLiveBadge>
                {t(locale, "planner.shareLiveBadge")}
              </SoftFailLiveBadge>
            )}
          </div>

          {/* Compact SoftFail mist band under azure Export rail — #255/#243 yield on /share. */}
          <SoftFailNotice
            open={shareSoftOpen}
            compact
            className="border-b border-[color:var(--bp-line)]"
          >
            {t(locale, "planner.shareSoftFail")}
          </SoftFailNotice>

          <div
            role="group"
            aria-label={t(locale, "planner.shareActions")}
            className={`flex flex-wrap items-center justify-end gap-2 px-3 py-2.5 text-sm ${
              shareSoftOpen ? softFailMistWashClass : ""
            }`}
          >
            <OfflinePinControl
              tripId={tripId}
              locale={locale}
              trip={trip}
              days={days}
              stops={stops}
              legs={legs}
              compact
            />
            <div className="flex flex-wrap items-center gap-1 border-l border-[color:var(--bp-line)] pl-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-bp-xs px-2 py-1.5 text-ink-soft bp-transition hover:text-river focus-within:ring-2 focus-within:ring-focus/40">
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
                className="rounded-bp-xs px-2.5 py-1.5 text-ink-soft underline-offset-4 bp-transition hover:text-river hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 disabled:opacity-40"
              >
                {duplicating
                  ? t(locale, "planner.duplicating")
                  : t(locale, "planner.duplicate")}
              </button>
            </div>
            <Link
              href={`/trips/${tripId}/journal`}
              className="rounded-bp border border-[color:var(--bp-line)] bg-foam/80 px-3.5 py-1.5 font-medium text-ink-soft bp-transition hover:border-river/40 hover:text-river focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {t(locale, "nav.journal")}
            </Link>
            <Link
              href={`/trips/${tripId}/share`}
              className="rounded-bp bg-river px-4 py-2 font-semibold tracking-wide text-foam shadow-bp-soft bp-transition hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {t(locale, "planner.shareCta")}
            </Link>
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
          onInviteOpenChange={setCollabInviteOpen}
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
              preference={preference}
              onPreferenceChange={(next) => void setEnginePreference(next)}
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

          {/*
            Transit filters SoftFail depth (BEA-358 after #129 / BEA-170) + craft
            SoftFail query parity (BEA-423): azure mode rail · Soft mode badge ·
            softSupport · compact SoftFail mist band (`border-b`) · tip-011
            mist-wash — Craft: ?modeSoftFail=1. Yields while TransferSteps
            SoftFail depth (BEA-378) / ?transferSoftFail=1 owns selected-stop
            soft chrome — never timber / Failed to fetch.
          */}
          <div className="border-t border-[color:var(--bp-line)] bg-foam/95 backdrop-blur-sm">
            <header
              className={`relative flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 pt-2.5 pb-1.5 ${
                modeSoftOpen ? softFailRailClass : ""
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                {t(locale, "planner.mode.eyebrow")}
              </span>
              <SoftFailSupport>{modeSupportCopy}</SoftFailSupport>
              {modeSoftOpen ? (
                <SoftFailBadge>
                  {t(locale, "planner.mode.softBadge")}
                </SoftFailBadge>
              ) : (
                <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-river">
                  {t(locale, `planner.mode.${travelMode}`)} ·{" "}
                  {t(locale, "planner.mode.selected")}
                </span>
              )}
            </header>

            {/* Compact SoftFail mist band under azure mode rail — yields while TransferSteps SoftFail depth (BEA-378) owns. */}
            <SoftFailNotice
              open={modeSoftOpen}
              compact
              className="border-b border-[color:var(--bp-line)]"
            >
              {modeSoftCopy}
            </SoftFailNotice>

            <SheetPresence
              open
              style={{ animationDelay: "40ms" }}
              aria-label={t(locale, "planner.mode.filterLabel")}
            >
              <div
                className={`animate-rise flex flex-wrap items-end gap-x-4 gap-y-3 px-4 pb-3 pt-1.5 ${
                  modeSoftOpen ? softFailMistWashClass : ""
                }`}
                style={{ animationDelay: "70ms" }}
              >
                <div
                  className={`inline-flex gap-0.5 rounded-bp-sm bg-mist/50 p-1 ${
                    modeSoftOpen
                      ? "bg-mist/70 shadow-[inset_3px_0_0_var(--bp-river)]"
                      : ""
                  }`}
                  role="group"
                  aria-label={t(locale, "planner.mode.filterLabel")}
                >
                  {(["walk", "transit", "drive"] as const).map((m) => {
                    const on = travelMode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setTravelMode(m)}
                        className={`rounded-bp-xs px-3.5 py-1.5 text-sm font-semibold bp-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                          on
                            ? "animate-stop-select bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
                            : "text-ink-soft hover:text-river"
                        }`}
                      >
                        {t(locale, `planner.mode.${m}`)}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={routing || dayStops.length < 2}
                  onClick={() => void generateRoutes()}
                  className="rounded-bp bg-river px-4 py-2.5 text-sm font-semibold text-foam shadow-bp-soft bp-transition hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {routing
                    ? t(locale, "planner.routing")
                    : t(locale, "planner.generateRoutes")}
                </button>
                {dayLegs.length > 0 && (
                  <p className="pb-1 text-sm tabular-nums text-ink-soft">
                    {dayLegs
                      .map(
                        (l) =>
                          `${formatDuration(l.durationSec)} · ${formatDistance(l.distanceM)}`,
                      )
                      .join("  →  ")}
                  </p>
                )}
                {demoShell && dayLegs.length > 0 && (
                  <span className="mb-1 rounded-bp-xs bg-mist px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft bp-transition">
                    {t(locale, "planner.transfer.demoBadge")}
                  </span>
                )}
              </div>
            </SheetPresence>
          </div>
        </section>

        {/*
          Stop drawer SoftFail depth (BEA-343 after #225):
          azure Itinerary rail · Soft drawer badge · softSupport · compact
          SoftFail mist band · tip-011 mist-wash body — empty SoftFail /
          day-fill SoftFail (#248) / drag SoftFail (BEA-348) yield Itinerary
          ownership — never timber / Failed to fetch.
        */}
        <aside
          className="animate-sheet-in flex flex-col border-t border-[color:var(--bp-line)] bg-foam lg:border-l lg:border-t-0"
          style={{ animationDelay: "100ms" }}
          aria-label={t(locale, "planner.drawer.eyebrow")}
        >
          <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                {t(locale, "planner.drawer.eyebrow")}
              </span>
              <SoftFailSupport>{drawerSupportCopy}</SoftFailSupport>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {demoShell ? (
                <SoftFailBadge>
                  {t(locale, "planner.drawer.demoBadge")}
                </SoftFailBadge>
              ) : (
                <SoftFailLiveBadge>
                  {t(locale, "planner.drawer.liveBadge")}
                </SoftFailLiveBadge>
              )}
              {drawerSoftOpen ? (
                <SoftFailBadge>
                  {t(locale, "planner.drawer.softBadge")}
                </SoftFailBadge>
              ) : null}
            </div>
          </header>

          {/* Compact SoftFail mist band under azure Itinerary rail — empty SoftFail / day-fill SoftFail (#248) / drag SoftFail (BEA-348) yield. */}
          <SoftFailNotice
            open={drawerSoftOpen}
            compact
            className="border-b border-[color:var(--bp-line)]"
          >
            {drawerSoftCopy}
          </SoftFailNotice>
          {/*
            Day tabs chrome (BEA-247 after #117): azure Days rail · mist
            underline select · tip-011 settle — SoftFail stays under Itinerary
            when drawer owns (BEA-343); empty SoftFail stays under Stops.
          */}
          <div
            className={`bp-day-tabs-chrome ${
              drawerSoftOpen ? softFailMistWashClass : ""
            }`}
          >
            <header className="relative flex flex-wrap items-center justify-between gap-2 px-4 pt-2.5 pb-1.5">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                  {t(locale, "planner.days.eyebrow")}
                </span>
                <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                  {t(locale, "planner.days.count").replace(
                    "{n}",
                    String(days.length),
                  )}
                </span>
                <span className="text-[11px] leading-snug text-ink-soft/80">
                  {t(locale, "planner.days.support")}
                </span>
              </div>
              {dayId ? (
                <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river bp-transition">
                  {t(locale, "planner.day")}{" "}
                  {Math.max(
                    1,
                    days.findIndex((d) => d.id === dayId) + 1,
                  )}{" "}
                  · {t(locale, "planner.days.selected")}
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft/55">
                  {t(locale, "planner.dayFill.days")}
                </span>
              )}
            </header>
            <div
              ref={dayTabsRef}
              role="tablist"
              aria-label={t(locale, "planner.days.eyebrow")}
              onKeyDown={onDayTabsKeyDown}
              className="bp-day-tab-rail--underline relative flex gap-0 overflow-x-auto"
            >
              {/* Tip 015 underline + tip-011 settle (pattern g / #46) */}
              {dayTabIndicator && (
                <span
                  aria-hidden
                  className={`animate-tab-indicator animate-tab-indicator--underline pointer-events-none absolute z-0${
                    dayTabSettleOn ? " bp-tab-indicator--settle" : ""
                  }`}
                  style={{
                    left: dayTabIndicator.left,
                    width: dayTabIndicator.width,
                  }}
                />
              )}
              {days.map((day, i) => {
                const active = dayId === day.id;
                const stopCount = dayStopCounts.get(day.id) ?? 0;
                return (
                  <button
                    key={day.id}
                    type="button"
                    role="tab"
                    id={`planner-day-tab-${day.id}`}
                    aria-selected={active}
                    aria-controls="planner-day-panel"
                    tabIndex={active ? 0 : -1}
                    ref={(el) => {
                      if (el) dayTabRefs.current.set(day.id, el);
                      else dayTabRefs.current.delete(day.id);
                    }}
                    onClick={() => selectDay(day.id)}
                    className="bp-day-tab relative z-[1] shrink-0 px-5 pt-3 text-left"
                  >
                    <div className="bp-day-tab__eyebrow text-[10px] font-semibold uppercase tracking-[0.16em]">
                      {t(locale, "planner.day")} {i + 1}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold tabular-nums">
                      {day.date}
                    </div>
                    <div className="bp-day-tab__meta">
                      {stopCount > 0
                        ? t(locale, "planner.days.stopsMeta").replace(
                            "{n}",
                            String(stopCount),
                          )
                        : t(locale, "planner.days.stopsMetaEmpty")}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            id="planner-day-panel"
            role="tabpanel"
            aria-labelledby={dayId ? `planner-day-tab-${dayId}` : undefined}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
          <DayTimelineScrub
            locale={locale}
            stops={dayStops}
            selectedStopId={selectedStopId}
            onSelectStop={setSelectedStopId}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/*
              Stops SoftFail depth (BEA-367 stop chips after #137 / BEA-355 empty /
              BEA-348 drag):
              azure Stops rail · Soft stops / Soft empty / Soft reorder badge ·
              softSupport · compact SoftFail mist band · tip-011 mist-wash empty
              body / chips — stop-drawer SoftFail (#257) / day-fill SoftFail
              (#248) yield — never timber / Failed to fetch.
            */}
            <div className="border-b border-[color:var(--bp-line)] bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]">
              <header
                className={`relative flex flex-wrap items-center justify-between gap-2 px-4 pt-2.5 pb-1.5 ${
                  chipsSoftOpen ? softFailRailClass : ""
                }`}
              >
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                    {t(locale, "planner.stops.eyebrow")}
                  </span>
                  <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                    {dayEmpty
                      ? t(locale, "planner.emptyDay")
                      : t(locale, "planner.stops.count").replace(
                          "{n}",
                          String(dayStops.length),
                        )}
                  </span>
                  <SoftFailSupport>{stopsSupportCopy}</SoftFailSupport>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {dayEmpty ? (
                    emptySoftOpen ? (
                      <SoftFailBadge>
                        {t(locale, "planner.emptySoftBadge")}
                      </SoftFailBadge>
                    ) : (
                      <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river bp-transition">
                        {t(locale, "planner.emptyBadge")}
                      </span>
                    )
                  ) : dragOwnsSoft && listSoftOpen ? (
                    <SoftFailBadge>
                      {t(locale, "planner.stops.dragSoftBadge")}
                    </SoftFailBadge>
                  ) : chipsSoftOpen ? (
                    <SoftFailBadge>
                      {t(locale, "planner.stops.softBadge")}
                    </SoftFailBadge>
                  ) : selectedStopId ? (
                    <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river bp-transition">
                      {dayStops.find((s) => s.id === selectedStopId)?.place
                        .name ?? t(locale, "planner.stops.selected")}{" "}
                      · {t(locale, "planner.stops.selected")}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft/55">
                      {t(locale, "planner.stopsList")}
                    </span>
                  )}
                </div>
              </header>

              {/* Compact SoftFail mist band under azure Stops rail — drawer SoftFail yields while chips SoftFail owns. */}
              <SoftFailNotice
                open={listSoftOpen}
                compact
                className="border-b border-[color:var(--bp-line)]"
              >
                {listSoftCopy}
              </SoftFailNotice>

              {!dayEmpty ? (
                <div
                  className={`animate-rise px-4 pb-2.5 ${
                    dragOwnsSoft || chipsSoftOpen ? softFailMistWashClass : ""
                  }`}
                  style={{ animationDelay: "40ms" }}
                >
                  <div
                    className={`flex gap-0.5 overflow-x-auto rounded-bp-sm bg-mist/50 p-1 ${
                      chipsSoftOpen
                        ? "bg-mist/70 shadow-[inset_3px_0_0_var(--bp-river)]"
                        : ""
                    }`}
                    role="group"
                    aria-label={t(locale, "planner.stops.filterLabel")}
                  >
                    {dayStops.map((stop, i) => {
                      const on = selectedStopId === stop.id;
                      return (
                        <button
                          key={stop.id}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${t(locale, "planner.stops.chip").replace("{n}", String(i + 1))}: ${stop.place.name}`}
                          onClick={() => setSelectedStopId(stop.id)}
                          className={`inline-flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-bp-xs px-2.5 py-1.5 text-left text-sm font-semibold bp-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                            on
                              ? "animate-stop-select bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
                              : "text-ink-soft hover:text-river"
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-bp-xs text-[10px] font-bold tabular-nums ${
                              on
                                ? "bg-river text-foam"
                                : "bg-ink/10 text-ink-soft"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <span className="min-w-0 truncate">
                            {stop.place.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!dayEmpty ? (
                <p
                  className={`animate-rise px-4 pb-2.5 text-[11px] leading-snug text-ink-soft/80 ${
                    dragOwnsSoft || chipsSoftOpen ? softFailMistWashClass : ""
                  }`}
                  style={{ animationDelay: "55ms" }}
                >
                  <span className="font-semibold uppercase tracking-[0.14em] text-river">
                    {t(locale, "planner.stops.dragEyebrow")}
                  </span>
                  <span className="mx-1.5 text-ink-soft/40" aria-hidden>
                    ·
                  </span>
                  {t(locale, "planner.stops.dragSupport")}
                </p>
              ) : null}
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto ${
                emptySoftOpen || dragOwnsSoft || chipsSoftOpen
                  ? softFailMistWashClass
                  : ""
              }`}
            >
              <StopReorderList
                items={dayStops}
                onReorder={(orderedIds) => {
                  void commitStopOrder(orderedIds);
                }}
                label={t(locale, "planner.stopsList")}
                dragHandleLabel={t(locale, "planner.dragReorder")}
                empty={
                  <li
                    key={`empty-${dayId ?? "none"}`}
                    className="list-none px-5 py-10"
                  >
                    <SheetPresence
                      open
                      className={`max-w-sm ${
                        emptySoftOpen
                          ? "rounded-bp-sm bg-mist/25 px-3 shadow-[inset_3px_0_0_var(--bp-river)] sm:px-4"
                          : ""
                      }`}
                      style={{ animationDelay: "40ms" }}
                      aria-label={t(locale, "planner.emptyDay")}
                    >
                      <p
                        className="animate-rise text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-river"
                        style={{ animationDelay: "40ms" }}
                      >
                        {t(locale, "planner.stops.eyebrow")}
                      </p>
                      <p
                        className="animate-rise mt-2 font-display text-2xl font-semibold tracking-tight text-ink md:text-[1.65rem]"
                        style={{ animationDelay: "70ms" }}
                      >
                        {t(locale, "planner.emptyDay")}
                      </p>
                      <p
                        className="animate-rise mt-2 text-sm leading-relaxed text-ink-soft"
                        style={{ animationDelay: "100ms" }}
                      >
                        {t(locale, "planner.emptyDayHint")}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.querySelector<HTMLInputElement>(
                            "[data-bp-place-search]",
                          );
                          el?.focus();
                          el?.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                          });
                        }}
                        className="animate-rise mt-6 rounded-bp bg-river px-4 py-2.5 text-sm font-semibold tracking-wide text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
                        style={{ animationDelay: "130ms" }}
                      >
                        {t(locale, "planner.emptyDayCta")}
                      </button>
                    </SheetPresence>
                  </li>
                }
                renderItem={(stop, ctx) => {
                  const selected = selectedStopId === stop.id;
                  const leg = dayLegs.find((l) => l.fromStopId === stop.id);
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-selected={selected}
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
                      className={`group relative flex gap-2 px-3 py-4 bp-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/40 sm:gap-3 sm:px-4 ${
                        selected
                          ? "animate-stop-select bg-river/[0.08] shadow-[inset_3px_0_0_var(--bp-river)]"
                          : "hover:bg-mist/30"
                      }`}
                    >
                      <button
                        type="button"
                        {...ctx.dragHandleProps}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span aria-hidden className="flex flex-col gap-[3px]">
                          <span className="block h-[2px] w-3 rounded-full bg-current opacity-90" />
                          <span className="block h-[2px] w-3 rounded-full bg-current opacity-90" />
                          <span className="block h-[2px] w-3 rounded-full bg-current opacity-90" />
                        </span>
                      </button>
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-bp text-xs font-bold tabular-nums shadow-bp-soft transition duration-bp-fast ease-bp-out ${
                          selected
                            ? "bg-river text-foam ring-1 ring-river/30"
                            : "bg-ink text-foam"
                        }`}
                      >
                        {ctx.index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <div
                            className={`min-w-0 truncate text-ink ${
                              selected
                                ? "font-display text-base font-bold tracking-tight"
                                : "font-semibold"
                            }`}
                          >
                            {stop.place.name}
                          </div>
                          {selected ? (
                            <span className="shrink-0 rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-river">
                              {t(locale, "planner.stops.selected")}
                            </span>
                          ) : null}
                        </div>
                        {stop.place.address && (
                          <div className="mt-0.5 truncate text-xs text-ink-soft">
                            {stop.place.address}
                          </div>
                        )}
                        {selected ? (
                          <SheetPresence
                            open
                            className="mt-3 overflow-hidden rounded-bp-sm border border-river/20 bg-paper/50 shadow-[inset_3px_0_0_var(--bp-river)]"
                            style={{ animationDelay: "40ms" }}
                            aria-label={t(
                              locale,
                              "planner.drawer.detailEyebrow",
                            )}
                          >
                            <header
                              className="animate-rise flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-foam/80 px-3 py-2"
                              style={{ animationDelay: "50ms" }}
                            >
                              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                                  {t(locale, "planner.drawer.detailEyebrow")}
                                </span>
                                <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                                  {t(locale, "planner.stops.chip").replace(
                                    "{n}",
                                    String(ctx.index + 1),
                                  )}
                                </span>
                                <SoftFailSupport>
                                  {t(locale, "planner.drawer.detailSupport")}
                                </SoftFailSupport>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {drawerSoftOpen ? (
                                  <SoftFailBadge>
                                    {t(locale, "planner.drawer.softBadge")}
                                  </SoftFailBadge>
                                ) : null}
                                <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-river">
                                  {t(locale, "planner.stops.selected")}
                                </span>
                              </div>
                            </header>
                            <div
                              className={`animate-rise space-y-0 px-2.5 pb-2.5 pt-0.5 [&>*]:!mt-2 [&>*:first-child]:!mt-1.5 ${
                                drawerSoftOpen ? softFailMistWashClass : ""
                              }`}
                              style={{ animationDelay: "70ms" }}
                            >
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
                              {(leg ||
                                (!routing &&
                                  ctx.index < dayStops.length - 1)) && (
                                <TransferSteps
                                  leg={leg ?? null}
                                  locale={locale}
                                  variant="inline"
                                  demoMode={engineInfo?.mode !== "live"}
                                  showSoftFail={Boolean(leg)}
                                  showEmpty={
                                    !routing &&
                                    !leg &&
                                    ctx.index < dayStops.length - 1
                                  }
                                  craftSoftFail={transferSoftPreview}
                                />
                              )}
                              {routing &&
                                !leg &&
                                ctx.index < dayStops.length - 1 && (
                                  <div
                                    className="animate-fade mt-2"
                                    aria-label={t(
                                      locale,
                                      "planner.transfer.loadingHint",
                                    )}
                                  >
                                    <TransferStepsSkeleton />
                                    <p className="mt-1.5 text-xs text-ink-soft">
                                      {t(
                                        locale,
                                        "planner.transfer.loadingHint",
                                      )}
                                    </p>
                                  </div>
                                )}
                              <BookingLinkChips
                                links={stop.bookingLinks}
                                locale={locale}
                              />
                            </div>
                          </SheetPresence>
                        ) : (
                          <BookingLinkChips
                            links={stop.bookingLinks}
                            locale={locale}
                          />
                        )}
                      </div>
                      <div
                        className={`flex shrink-0 flex-col gap-0.5 rounded-bp-xs bg-mist/45 p-0.5 transition duration-bp-fast ease-bp-out ${
                          ctx.isDragging
                            ? "opacity-100"
                            : "opacity-50 group-hover:opacity-100 group-focus-within:opacity-100"
                        }`}
                      >
                        <button
                          type="button"
                          aria-label={t(locale, "planner.moveUp")}
                          className="rounded-bp-xs px-1.5 py-0.5 text-ink-soft bp-transition hover:bg-foam hover:text-river hover:shadow-bp-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
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
                          className="rounded-bp-xs px-1.5 py-0.5 text-ink-soft bp-transition hover:bg-foam hover:text-river hover:shadow-bp-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
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
                          className="rounded-bp-xs px-1.5 py-0.5 text-ink-soft bp-transition hover:bg-foam hover:text-timber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
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
            </div>
          </div>
          </div>

          {error && !isPlannerNoiseError(new Error(error)) && (
            <p className="px-4 py-2 text-sm text-timber" role="alert">
              {error}
            </p>
          )}
          <footer className="border-t border-[color:var(--bp-line)] bg-paper/40 px-4 py-3 shadow-[inset_3px_0_0_var(--bp-river)]">
            <p className="text-[11px] leading-snug text-ink-soft/80">
              <span className="font-semibold uppercase tracking-[0.14em] text-river">
                {t(locale, "planner.drawer.hintEyebrow")}
              </span>
              <span className="mx-1.5 text-ink-soft/40" aria-hidden>
                ·
              </span>
              {t(locale, "planner.hint")}
            </p>
          </footer>
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
          inviteOpen={collabInviteOpen}
        />
      </div>
    </div>
  );
}
