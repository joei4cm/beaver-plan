import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  DEMO_PLACE_TAGS,
  DemoRoutingEngine,
  formatDistance,
  formatDuration,
  getDemoPlaceDetails,
  routeAdjacentStops,
  sampleKyotoCollab,
  sampleKyotoFixture,
  searchDemoPlaces,
  stopsForDay,
  toPlaceRef,
  type ActivityEvent,
  type BookingLinkKind,
  type Day,
  type Leg,
  type PlaceDetails,
  type PlaceSummary,
  type Stop,
  type Trip,
  type TripComment,
} from "@beaver/core";

type TravelMode = "walk" | "transit" | "drive";
const TRAVEL_MODES: TravelMode[] = ["walk", "transit", "drive"];
import { colors, motion, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import type { JournalEntry, TripMember, TripRole } from "@beaver/core";
import type { OfflinePinStatus } from "@beaver/offline";
import {
  addTripStop,
  createInvite,
  fetchJournal,
  fetchMembers,
  fetchPlaceDetails,
  fetchTrip,
  isApiSoftFail,
  routeTripDay,
  searchPlaces,
} from "../../src/api";
import { BookingPanel } from "../../src/components/booking-panel";
import { DayFillPanel } from "../../src/components/day-fill-panel";
import { PlaceIntel } from "../../src/components/place-intel";
import { SheetPresence } from "../../src/components/sheet-presence";
import { SoftFailNotice } from "../../src/components/soft-fail-notice";
import { TransferSteps } from "../../src/components/transfer-steps";
import { TripMap } from "../../src/components/trip-map";
import {
  flushJournalQueue,
  getPinStatus,
  isDeviceOnline,
  pinTripForOffline,
  readCachedTrip,
  unpinTripOffline,
} from "../../src/offline/trip-offline";
import { type } from "../../src/theme";

const locale = "zh-CN" as const;
const SEARCH_DEBOUNCE_MS = 220;

/** Tip 011 — shared #46 motion easings (match Expo cards #67). */
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);
const easePop = Easing.bezier(0.34, 1.56, 0.64, 1);

function formatTripSupport(trip: Trip): string {
  const parts: string[] = [];
  if (trip.destination) parts.push(trip.destination);
  if (trip.startDate) {
    const range =
      trip.endDate && trip.endDate !== trip.startDate
        ? `${trip.startDate} → ${trip.endDate}`
        : trip.startDate;
    parts.push(range);
  }
  return parts.join(" · ");
}

function memberInitials(label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase() || "?";
}

function isNoiseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /_503$|_502$|_504$|Failed to fetch|Network request failed|load_failed|ECONNREFUSED/i.test(
      msg,
    ) || msg.includes("places/search_")
  );
}

function newLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

export default function TripDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = typeof id === "string" ? id : "sample-kyoto";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [yourRole, setYourRole] = useState<TripRole | null>(null);
  const [comments, setComments] = useState<TripComment[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [collabSeeded, setCollabSeeded] = useState(false);
  const [collabSoftOffline, setCollabSoftOffline] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [pinStatus, setPinStatus] = useState<OfflinePinStatus | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(isDeviceOnline);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [placeDetailsMode, setPlaceDetailsMode] = useState<"live" | "demo">(
    "demo",
  );
  const [placeDetailsLoading, setPlaceDetailsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDemo, setSearchDemo] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [routing, setRouting] = useState(false);
  /** Soft demo when Directions API absent / route-day soft-fails. */
  const [routingDemo, setRoutingDemo] = useState(true);
  /** Transit filter chips — walk / transit / drive (web #129). */
  const [travelMode, setTravelMode] = useState<TravelMode>("transit");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);
  const searchInputRef = useRef<TextInput | null>(null);
  const rise = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(0)).current;
  const stopPop = useRef(new Animated.Value(1)).current;
  /** Tip-011 settle on mode chip select (web animate-stop-select). */
  const modeChipPop = useRef(new Animated.Value(1)).current;
  const presencePulse = useRef(new Animated.Value(0)).current;
  /** Tip 015 stretch + tip-011 settle — underline select (web #117). */
  const dayTabLayouts = useRef(new Map<string, { x: number; width: number }>());
  const dayUnderlineLeft = useRef(new Animated.Value(0)).current;
  const dayUnderlineWidth = useRef(new Animated.Value(0)).current;
  const dayUnderlineSettle = useRef(new Animated.Value(1)).current;
  const dayUnderlineOpacity = useRef(new Animated.Value(1)).current;
  const dayUnderlineReady = useRef(false);
  const reduceMotionRef = useRef(false);
  const [dayUnderlineVisible, setDayUnderlineVisible] = useState(false);

  const refreshPin = useCallback(async () => {
    try {
      setPinStatus(await getPinStatus(tripId));
    } catch {
      setPinStatus(null);
    }
  }, [tripId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isDeviceOnline()) {
        try {
          await flushJournalQueue();
        } catch {
          /* keep queue */
        }
      }
      const data = await fetchTrip(tripId);
      setTrip(data.trip);
      setDays(data.days);
      setStops(data.stops);
      setLegs(data.legs);
      setDayId(data.days[0]?.id ?? null);
      setMembers(data.members ?? []);
      setYourRole(data.yourRole ?? null);
      setFromCache(false);
      try {
        const j = await fetchJournal(tripId);
        setJournal(j.entries);
      } catch {
        /* journal optional for pin snapshot */
      }
      try {
        const m = await fetchMembers(tripId);
        if (tripId === "sample-kyoto" && m.members.length === 0) {
          const seed = sampleKyotoCollab();
          setMembers(seed.members);
          setYourRole(seed.yourRole);
          setComments(seed.comments);
          setActivity(seed.events);
          setCollabSeeded(true);
          setCollabSoftOffline(false);
        } else {
          setMembers(m.members);
          setYourRole(m.yourRole);
          setCollabSeeded(false);
          setCollabSoftOffline(false);
        }
      } catch {
        if (tripId === "sample-kyoto") {
          const seed = sampleKyotoCollab();
          setMembers(seed.members);
          setYourRole(seed.yourRole);
          setComments(seed.comments);
          setActivity(seed.events);
          setCollabSeeded(true);
          setCollabSoftOffline(true);
        }
      }
      await refreshPin();
    } catch (e) {
      const cached = await readCachedTrip(tripId);
      if (cached) {
        setTrip(cached.trip);
        setDays(cached.days);
        setStops(cached.stops);
        setLegs(cached.legs);
        setJournal(cached.journal);
        setDayId(cached.days[0]?.id ?? null);
        setFromCache(true);
        setSoftNotice(t(locale, "planner.demoLocal"));
        setError(null);
        if (tripId === "sample-kyoto") {
          const seed = sampleKyotoCollab();
          setMembers(seed.members);
          setYourRole(seed.yourRole);
          setComments(seed.comments);
          setActivity(seed.events);
          setCollabSeeded(true);
          setCollabSoftOffline(true);
        }
        await refreshPin();
      } else if (tripId === "sample-kyoto") {
        const fixture = sampleKyotoFixture();
        const seed = sampleKyotoCollab();
        setTrip(fixture.trip);
        setDays(fixture.days);
        setStops(fixture.stops);
        setLegs(fixture.legs);
        setDayId(fixture.days[0]?.id ?? null);
        setMembers(seed.members);
        setYourRole(seed.yourRole);
        setComments(seed.comments);
        setActivity(seed.events);
        setCollabSeeded(true);
        setCollabSoftOffline(true);
        setFromCache(true);
        setSoftNotice(t(locale, "planner.demoLocal"));
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "load_failed");
      }
    } finally {
      setLoading(false);
    }
  }, [refreshPin, tripId]);

  function seedDemoInvite() {
    const code = "BP-DEMO42";
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://beaver.plan";
    setInviteCode(code);
    setInviteUrl(`${origin}/invite/${code}`);
    setInviteCopied(false);
    setInviteOpen(true);
  }

  async function onInvite() {
    setError(null);
    setInviteCopied(false);
    if (collabSeeded || collabSoftOffline) {
      seedDemoInvite();
      return;
    }
    try {
      const inv = await createInvite(tripId, "editor");
      setInviteCode(inv.code);
      setInviteUrl(inv.inviteUrl);
      setInviteOpen(true);
    } catch (e) {
      if (isNoiseError(e)) {
        setCollabSeeded(true);
        setCollabSoftOffline(true);
        seedDemoInvite();
        setError(null);
        return;
      }
      setError(e instanceof Error ? e.message : "invite_failed");
    }
  }

  async function onCopyInvite() {
    if (!inviteUrl) return;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteCopied(true);
        return;
      }
    } catch {
      /* fall through */
    }
    setInviteCopied(false);
  }

  function presenceFor(role: TripRole): "active" | "idle" | "away" {
    if (role === "owner") return "active";
    if (role === "editor") return "idle";
    return "away";
  }

  async function onTogglePin() {
    if (!trip) return;
    setPinBusy(true);
    setPinError(null);
    try {
      if (pinStatus?.pinned) {
        await unpinTripOffline(tripId);
      } else {
        await pinTripForOffline({
          trip,
          days,
          stops,
          legs,
          journal,
        });
      }
      await refreshPin();
    } catch (e) {
      // Soft-fail pin chrome — never timber the whole trip page (#87 parity).
      if (isNoiseError(e)) {
        setSoftNotice(t(locale, "planner.demoLocal"));
        setPinError(null);
      } else {
        setPinError(e instanceof Error ? e.message : "pin_failed");
      }
    } finally {
      setPinBusy(false);
    }
  }

  useEffect(() => {
    const syncOnline = () => setOnline(isDeviceOnline());
    syncOnline();
    if (typeof window === "undefined") return;
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading || !trip) {
      rise.setValue(0);
      sheet.setValue(0);
      return;
    }
    rise.setValue(0);
    sheet.setValue(0);
    Animated.parallel([
      Animated.timing(rise, {
        toValue: 1,
        duration: motion.durationMdMs,
        easing: easeRise,
        useNativeDriver: true,
      }),
      Animated.timing(sheet, {
        toValue: 1,
        duration: motion.durationLgMs,
        delay: 80,
        easing: easeRise,
        useNativeDriver: true,
      }),
    ]).start();
  }, [loading, trip, rise, sheet]);

  useEffect(() => {
    if (!selectedStopId) return;
    stopPop.setValue(0.86);
    Animated.timing(stopPop, {
      toValue: 1,
      duration: motion.durationSmMs,
      easing: easePop,
      useNativeDriver: true,
    }).start();
  }, [selectedStopId, stopPop]);

  useEffect(() => {
    if (reduceMotionRef.current) {
      modeChipPop.setValue(1);
      return;
    }
    modeChipPop.setValue(0.88);
    Animated.timing(modeChipPop, {
      toValue: 1,
      duration: motion.durationSmMs,
      easing: easePop,
      useNativeDriver: true,
    }).start();
  }, [travelMode, modeChipPop]);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) reduceMotionRef.current = enabled;
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotionRef.current = enabled;
      },
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const applyDayUnderline = useCallback(
    (dayKey: string, animate: boolean) => {
      const layout = dayTabLayouts.current.get(dayKey);
      if (!layout) return;
      /* Underline sits inset under the label block (tip 015 stretch). */
      const INSET_X = 10;
      const left = layout.x + INSET_X;
      const width = Math.max(12, layout.width - INSET_X * 2);
      setDayUnderlineVisible(true);
      if (!dayUnderlineReady.current || !animate || reduceMotionRef.current) {
        dayUnderlineLeft.setValue(left);
        dayUnderlineWidth.setValue(width);
        dayUnderlineSettle.setValue(1);
        dayUnderlineOpacity.setValue(1);
        dayUnderlineReady.current = true;
        return;
      }
      Animated.parallel([
        Animated.timing(dayUnderlineLeft, {
          toValue: left,
          duration: motion.durationMdMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(dayUnderlineWidth, {
          toValue: width,
          duration: motion.durationMdMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]).start();
    },
    [dayUnderlineLeft, dayUnderlineOpacity, dayUnderlineSettle, dayUnderlineWidth],
  );

  useEffect(() => {
    if (!dayId) {
      setDayUnderlineVisible(false);
      dayUnderlineReady.current = false;
      return;
    }
    applyDayUnderline(dayId, true);
    if (reduceMotionRef.current) {
      dayUnderlineSettle.setValue(1);
      dayUnderlineOpacity.setValue(1);
      return;
    }
    /* Tip-011 underline settle without remounting (keeps tip-015 stretch). */
    dayUnderlineSettle.setValue(0.35);
    dayUnderlineOpacity.setValue(0.55);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(dayUnderlineSettle, {
          toValue: 1.28,
          duration: Math.round(motion.durationMdMs * 0.55),
          easing: easeRise,
          useNativeDriver: false,
        }),
        Animated.timing(dayUnderlineSettle, {
          toValue: 1,
          duration: Math.round(motion.durationMdMs * 0.45),
          easing: easeRise,
          useNativeDriver: false,
        }),
      ]),
      Animated.timing(dayUnderlineOpacity, {
        toValue: 1,
        duration: Math.round(motion.durationMdMs * 0.55),
        easing: easeRise,
        useNativeDriver: false,
      }),
    ]).start();
  }, [
    applyDayUnderline,
    dayId,
    dayUnderlineOpacity,
    dayUnderlineSettle,
  ]);

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
    setPlaceDetails(
      getDemoPlaceDetails(placeId, locale, DEMO_PLACE_TAGS[placeId]),
    );
    setPlaceDetailsMode("demo");

    void fetchPlaceDetails({
      placeId,
      language: locale,
      engine: trip?.mapEngine === "auto" ? "auto" : trip?.mapEngine,
      timezone: trip?.timezone,
    })
      .then((data) => {
        if (cancelled) return;
        setPlaceDetails(data.place);
        setPlaceDetailsMode(data.mode);
      })
      .catch((e) => {
        if (cancelled) return;
        setPlaceDetails(
          getDemoPlaceDetails(placeId, locale, DEMO_PLACE_TAGS[placeId]),
        );
        setPlaceDetailsMode("demo");
        if (isNoiseError(e) || isApiSoftFail(e)) {
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
  }, [selectedStopId, stops, trip?.mapEngine, trip?.timezone]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(presencePulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(presencePulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [presencePulse]);

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );
  const dayLegs = useMemo(() => {
    const ids = new Set(dayStops.map((s) => s.id));
    return legs.filter((l) => ids.has(l.fromStopId) && ids.has(l.toStopId));
  }, [legs, dayStops]);

  const routeDayStops = useCallback(
    async (
      activeDayId: string,
      orderedStops: Stop[],
      mode: TravelMode = travelMode,
    ) => {
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
      try {
        const res = await routeTripDay({
          tripId,
          dayId: activeDayId,
          mode,
        });
        setLegs((prev) => {
          const ids = new Set(orderedStops.map((s) => s.id));
          const kept = prev.filter(
            (l) => !(ids.has(l.fromStopId) && ids.has(l.toStopId)),
          );
          return [...kept, ...res.legs];
        });
        const demo = res.mode !== "live";
        setRoutingDemo(demo);
        if (demo) {
          setSoftNotice(t(locale, "planner.transfer.demoNotice"));
        }
      } catch (e) {
        const routingEngine = new DemoRoutingEngine("google");
        const demoLegs = await routeAdjacentStops(
          routingEngine,
          orderedStops,
          mode,
          locale,
        );
        setLegs((prev) => {
          const ids = new Set(orderedStops.map((s) => s.id));
          const kept = prev.filter(
            (l) => !(ids.has(l.fromStopId) && ids.has(l.toStopId)),
          );
          return [...kept, ...demoLegs];
        });
        // Soft-fail always — demo legs painted; never Failed to fetch timber.
        setRoutingDemo(true);
        setSoftNotice(t(locale, "planner.transfer.demoNotice"));
        setError(null);
        void e;
      } finally {
        setRouting(false);
      }
    },
    [travelMode, tripId],
  );

  function selectTravelMode(next: TravelMode) {
    setTravelMode((prev) => (prev === next ? prev : next));
  }

  function generateRoutes() {
    if (!dayId || dayStops.length < 2 || routing) return;
    void routeDayStops(dayId, dayStops, travelMode);
  }

  const runSearch = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q) {
        setResults([]);
        setActiveIndex(0);
        return;
      }
      const gen = ++searchGenRef.current;
      const demoHits = searchDemoPlaces(q);
      setResults(demoHits);
      setActiveIndex(0);
      setSearchDemo(true);
      setSearching(true);
      try {
        const center = dayStops[0]?.place;
        const data = await searchPlaces({
          q,
          lat: center?.lat,
          lng: center?.lng,
          language: locale,
          timezone: trip?.timezone,
        });
        if (gen !== searchGenRef.current) return;
        if (data.places.length > 0) {
          setResults(data.places);
          setActiveIndex(0);
          setSearchDemo(false);
        }
      } catch (e) {
        if (gen !== searchGenRef.current) return;
        if (isNoiseError(e)) {
          setSearchDemo(true);
          setError(null);
        }
      } finally {
        if (gen === searchGenRef.current) setSearching(false);
      }
    },
    [dayStops, trip?.timezone],
  );

  function scheduleSearch(text: string) {
    setQuery(text);
    setSearchOpen(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = text.trim();
    if (q) {
      setResults(searchDemoPlaces(q));
      setActiveIndex(0);
      setSearchDemo(true);
    } else {
      setResults([]);
      setActiveIndex(0);
    }
    searchTimerRef.current = setTimeout(() => {
      void runSearch(text);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    setActiveIndex(0);
    setSearchOpen(false);
  }

  async function addPlace(place: PlaceSummary) {
    if (!dayId || !trip) return;
    setError(null);
    try {
      await addTripStop({
        tripId,
        dayId,
        place,
        expectedVersion: trip.version,
      });
      clearSearch();
      const payload = await fetchTrip(tripId);
      setTrip(payload.trip);
      setDays(payload.days);
      setStops(payload.stops);
      setLegs(payload.legs);
      const ordered = stopsForDay(payload.stops, dayId);
      setSelectedStopId(ordered[ordered.length - 1]?.id ?? null);
      await routeDayStops(dayId, ordered);
    } catch (e) {
      const stop: Stop = {
        id: newLocalId("local-stop"),
        dayId,
        order: dayStops.length,
        place: toPlaceRef("google", place),
        photos: [],
        bookingLinks: [],
      };
      const nextStops = [...stops, stop];
      setStops(nextStops);
      setTrip((prev) =>
        prev ? { ...prev, version: prev.version + 1 } : prev,
      );
      clearSearch();
      setSelectedStopId(stop.id);
      setSoftNotice(t(locale, "planner.demoLocal"));
      setError(null);
      void e;
      await routeDayStops(dayId, stopsForDay(nextStops, dayId));
    }
  }

  function pickActive() {
    const place = results[activeIndex];
    if (place) void addPlace(place);
  }

  function onSearchKeyPress(e: { nativeEvent: { key: string } }) {
    const key = e.nativeEvent.key;
    const q = query.trim();
    const hasHits = results.length > 0;
    const emptyOpen = q.length > 0 && !searching && !hasHits;
    const sheetVisible =
      searchOpen && q.length > 0 && (hasHits || emptyOpen || searching);
    if (key === "Enter") {
      if (hasHits) pickActive();
      else void runSearch(query);
      return;
    }
    if (key === "Escape") {
      if (sheetVisible) clearSearch();
      return;
    }
    if (!hasHits) return;
    if (key === "ArrowDown") {
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (key === "ArrowUp") {
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
  }

  function selectStop(id: string) {
    setSelectedStopId(id);
  }

  function selectDay(nextDayId: string) {
    setDayId((prev) => (prev === nextDayId ? prev : nextDayId));
    setSelectedStopId(null);
  }

  const googleKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null;

  const searchQ = query.trim();
  const hasSearchResults = results.length > 0;
  const showSearchEmpty =
    searchOpen && searchQ.length > 0 && !searching && !hasSearchResults;
  const searchSheetOpen =
    searchOpen &&
    searchQ.length > 0 &&
    (hasSearchResults || showSearchEmpty || searching);

  const riseStyle = {
    opacity: rise,
    transform: [
      {
        translateY: rise.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  };

  const sheetStyle = {
    opacity: sheet,
    transform: [
      {
        translateY: sheet.interpolate({
          inputRange: [0, 1],
          outputRange: [22, 0],
        }),
      },
    ],
  };

  /** Invite SoftFailNotice chrome — invite-scoped copy after web #130. */
  const inviteSoftOpen = collabSeeded || collabSoftOffline;
  const inviteSoftCopy = collabSoftOffline
    ? t(locale, "collab.inviteSoftFail")
    : t(locale, "collab.inviteDemoNotice");

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: trip?.title ?? t(locale, "planner.trip"),
          headerStyle: { backgroundColor: colors.foam },
          headerTintColor: colors.ink,
        }}
      />
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.river} />
        </View>
      )}
      {!loading && error && (
        <View style={styles.center}>
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
          <Text style={styles.hint}>{t(locale, "planner.notFound")}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      )}
      {!loading && trip && (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.skyWash} pointerEvents="none" />

          <Animated.View style={[styles.header, riseStyle]}>
            <Text style={styles.brandLine}>
              Beaver Plan · {trip.destination ?? t(locale, "planner.trip")}
              {fromCache ? ` · ${t(locale, "offline.offline")}` : ""}
            </Text>
            <Text style={styles.title}>{trip.title}</Text>
            {formatTripSupport(trip) ? (
              <Text style={styles.support}>{formatTripSupport(trip)}</Text>
            ) : null}
            <View style={styles.actionRow}>
              <Pressable
                style={StyleSheet.flatten([
                  styles.actionBtn,
                  styles.actionPrimary,
                ])}
                onPress={() => router.push(`/trips/${tripId}/share`)}
              >
                <Text
                  style={StyleSheet.flatten([
                    styles.actionLabel,
                    styles.actionPrimaryLabel,
                  ])}
                >
                  {t(locale, "mobile.share")}
                </Text>
              </Pressable>
              <Pressable
                style={StyleSheet.flatten([
                  styles.actionBtn,
                  styles.actionOutline,
                ])}
                onPress={() => router.push(`/trips/${tripId}/journal`)}
              >
                <Text
                  style={StyleSheet.flatten([
                    styles.actionLabel,
                    styles.actionOutlineLabel,
                  ])}
                >
                  {t(locale, "mobile.journal")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.actionBtn}
                onPress={() => router.push("/translate")}
              >
                <Text style={styles.actionLabel}>
                  {t(locale, "mobile.translate")}
                </Text>
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View style={riseStyle}>
            <SoftFailNotice
              open={Boolean(softNotice) || fromCache || !online}
              style={styles.softBanner}
            >
              {!online || fromCache
                ? softNotice ?? t(locale, "planner.demoLocal")
                : (softNotice ?? "")}
            </SoftFailNotice>
          </Animated.View>

          <Animated.View style={sheetStyle}>
            <TripMap
              stops={dayStops}
              legs={dayLegs}
              selectedStopId={selectedStopId}
              onSelectStop={selectStop}
              googleMapsKey={googleKey}
            />

            <View style={styles.sheet}>
              {/* Day tabs — underline select + tip-011 settle (web #117 / tip 015). */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.dayRow}
                contentContainerStyle={styles.dayRowContent}
                accessibilityRole="tablist"
                accessibilityLabel={t(locale, "planner.dayFill.days")}
              >
                <View style={styles.dayRailInner}>
                  {dayUnderlineVisible ? (
                    <Animated.View
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      style={StyleSheet.flatten([
                        styles.dayUnderline,
                        {
                          left: dayUnderlineLeft,
                          width: dayUnderlineWidth,
                          opacity: dayUnderlineOpacity,
                          transform: [{ scaleY: dayUnderlineSettle }],
                        },
                      ])}
                    />
                  ) : null}
                  {days.map((day, i) => {
                    const active = dayId === day.id;
                    return (
                      <Pressable
                        key={day.id}
                        onPress={() => selectDay(day.id)}
                        onLayout={(e) => {
                          const { x, width } = e.nativeEvent.layout;
                          dayTabLayouts.current.set(day.id, { x, width });
                          if (day.id === dayId) {
                            applyDayUnderline(day.id, dayUnderlineReady.current);
                          }
                        }}
                        style={StyleSheet.flatten([
                          styles.dayChip,
                          active ? styles.dayChipActive : null,
                        ])}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={StyleSheet.flatten([
                            styles.dayChipEyebrow,
                            active ? styles.dayChipEyebrowActive : null,
                          ])}
                        >
                          {t(locale, "planner.day")} {i + 1}
                        </Text>
                        <Text
                          style={StyleSheet.flatten([
                            styles.dayChipDate,
                            active ? styles.dayChipDateActive : null,
                          ])}
                        >
                          {day.date}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Transit filter chips — mist-track · azure select · SoftFailNotice · #46 */}
              <View style={styles.modeFilter}>
                <View style={styles.modeFilterHead}>
                  <Text style={styles.modeEyebrow}>
                    {t(locale, "planner.mode.eyebrow")}
                  </Text>
                  <Text style={styles.modeSupport}>
                    {t(locale, "planner.mode.support")}
                  </Text>
                  <View style={styles.modeSelectedBadge}>
                    <Text style={styles.modeSelectedBadgeText}>
                      {t(locale, `planner.mode.${travelMode}`)} ·{" "}
                      {t(locale, "planner.mode.selected")}
                    </Text>
                  </View>
                </View>

                <View style={styles.modeFilterBody}>
                  <View
                    style={styles.modeMistTrack}
                    accessibilityRole="tablist"
                    accessibilityLabel={t(locale, "planner.mode.filterLabel")}
                  >
                    {TRAVEL_MODES.map((m) => {
                      const on = travelMode === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => selectTravelMode(m)}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: on }}
                          style={StyleSheet.flatten([
                            styles.modeChip,
                            on ? styles.modeChipOn : null,
                          ])}
                        >
                          <Animated.Text
                            style={StyleSheet.flatten([
                              styles.modeChipLabel,
                              on ? styles.modeChipLabelOn : null,
                              on
                                ? { transform: [{ scale: modeChipPop }] }
                                : null,
                            ])}
                          >
                            {t(locale, `planner.mode.${m}`)}
                          </Animated.Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    disabled={routing || dayStops.length < 2}
                    onPress={generateRoutes}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: routing || dayStops.length < 2,
                      busy: routing,
                    }}
                    style={StyleSheet.flatten([
                      styles.modeGenerate,
                      routing || dayStops.length < 2
                        ? styles.modeGenerateDisabled
                        : null,
                    ])}
                  >
                    <Text style={styles.modeGenerateLabel}>
                      {routing
                        ? t(locale, "planner.routing")
                        : t(locale, "planner.generateRoutes")}
                    </Text>
                  </Pressable>

                  {dayLegs.length > 0 ? (
                    <Text style={styles.modeLegSummary}>
                      {dayLegs
                        .map(
                          (l) =>
                            `${formatDuration(l.durationSec)} · ${formatDistance(l.distanceM)}`,
                        )
                        .join("  →  ")}
                    </Text>
                  ) : null}

                  {routingDemo && dayLegs.length > 0 ? (
                    <View style={styles.modeDemoBadge}>
                      <Text style={styles.modeDemoBadgeText}>
                        {t(locale, "planner.transfer.demoBadge")}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <SoftFailNotice
                  open={routingDemo && dayLegs.length > 0}
                  compact
                >
                  {t(locale, "planner.transfer.demoNotice")}
                </SoftFailNotice>
              </View>

              <View style={styles.searchWrap}>
                <TextInput
                  ref={searchInputRef}
                  value={query}
                  onChangeText={scheduleSearch}
                  onFocus={() => setSearchOpen(true)}
                  onKeyPress={onSearchKeyPress}
                  placeholder={t(locale, "planner.searchPlaceholder")}
                  placeholderTextColor={colors.inkSoft}
                  style={styles.searchInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                  accessibilityRole="search"
                  accessibilityState={{ expanded: searchSheetOpen }}
                />
                {searching || routing ? (
                  <ActivityIndicator
                    style={styles.searchSpinner}
                    color={colors.river}
                    size="small"
                  />
                ) : null}
                {searchSheetOpen ? (
                  <View
                    style={styles.searchSheet}
                    accessibilityRole="list"
                    accessibilityLabel={t(locale, "planner.search.eyebrow")}
                  >
                    <View style={styles.searchSheetHead}>
                      <View style={styles.searchSheetHeadText}>
                        <Text style={styles.searchEyebrow}>
                          {t(locale, "planner.search.eyebrow")}
                        </Text>
                        {hasSearchResults ? (
                          <Text style={styles.searchCount}>
                            {t(locale, "planner.search.resultsCount").replace(
                              "{n}",
                              String(results.length),
                            )}
                          </Text>
                        ) : null}
                      </View>
                      <View
                        style={StyleSheet.flatten([
                          styles.searchBadge,
                          searchDemo
                            ? styles.searchBadgeDemo
                            : styles.searchBadgeLive,
                        ])}
                      >
                        <Text
                          style={StyleSheet.flatten([
                            styles.searchBadgeText,
                            searchDemo
                              ? styles.searchBadgeTextDemo
                              : styles.searchBadgeTextLive,
                          ])}
                        >
                          {searchDemo
                            ? t(locale, "planner.search.demoBadge")
                            : t(locale, "planner.search.liveBadge")}
                        </Text>
                      </View>
                    </View>

                    {hasSearchResults ? (
                      <View style={styles.searchHits}>
                        {results.map((place, i) => {
                          const selected = i === activeIndex;
                          return (
                            <Pressable
                              key={place.enginePlaceId}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => void addPlace(place)}
                              onPressIn={() => setActiveIndex(i)}
                              style={StyleSheet.flatten([
                                styles.searchHit,
                                selected ? styles.searchHitSelected : null,
                                i === results.length - 1
                                  ? styles.searchHitLast
                                  : null,
                              ])}
                            >
                              <View
                                style={StyleSheet.flatten([
                                  styles.searchHitIndex,
                                  selected
                                    ? styles.searchHitIndexSelected
                                    : null,
                                ])}
                              >
                                <Text
                                  style={StyleSheet.flatten([
                                    styles.searchHitIndexText,
                                    selected
                                      ? styles.searchHitIndexTextSelected
                                      : null,
                                  ])}
                                >
                                  {i + 1}
                                </Text>
                              </View>
                              <View style={styles.searchHitBody}>
                                <Text style={styles.searchHitName}>
                                  {place.name}
                                </Text>
                                {place.address ? (
                                  <Text style={styles.searchHitAddr}>
                                    {place.address}
                                  </Text>
                                ) : null}
                              </View>
                              <Text
                                style={StyleSheet.flatten([
                                  styles.searchHitHint,
                                  selected
                                    ? styles.searchHitHintSelected
                                    : null,
                                ])}
                              >
                                {t(locale, "planner.search.addHint")}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : showSearchEmpty ? (
                      <View style={styles.searchEmpty}>
                        <Text style={styles.searchEmptyTitle}>
                          {t(locale, "planner.search.emptyTitle")}
                        </Text>
                        <Text style={styles.searchEmptyHint}>
                          {t(locale, "planner.search.emptyHint")}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.searchLoading}>
                        <Text style={styles.searchLoadingText}>
                          {t(locale, "planner.search")}…
                        </Text>
                      </View>
                    )}

                    <SoftFailNotice
                      open={searchDemo && hasSearchResults}
                      compact
                    >
                      {t(locale, "planner.searchDemo")}
                    </SoftFailNotice>
                    <SoftFailNotice
                      open={searchDemo && showSearchEmpty}
                      compact
                    >
                      {t(locale, "planner.search.softFailEmpty")}
                    </SoftFailNotice>
                  </View>
                ) : null}
              </View>

              {dayStops.map((stop, index) => {
                const leg = dayLegs.find((l) => l.fromStopId === stop.id);
                const selected = stop.id === selectedStopId;
                return (
                  <Pressable
                    key={stop.id}
                    style={StyleSheet.flatten([
                      styles.stopRow,
                      selected ? styles.stopRowSelected : null,
                    ])}
                    onPress={() => selectStop(stop.id)}
                  >
                    <Animated.View
                      style={[
                        styles.stopIndex,
                        selected ? styles.stopIndexSelected : null,
                        selected
                          ? { transform: [{ scale: stopPop }] }
                          : null,
                      ]}
                    >
                      <Text style={styles.stopIndexText}>{index + 1}</Text>
                    </Animated.View>
                    <View style={styles.stopBody}>
                      <Text style={styles.stopName}>{stop.place.name}</Text>
                      {stop.place.address ? (
                        <Text style={styles.stopAddr}>
                          {stop.place.address}
                        </Text>
                      ) : null}
                      {selected ? (
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
                      ) : null}
                      {(leg ||
                        (selected &&
                          !routing &&
                          index < dayStops.length - 1)) && (
                        <TransferSteps
                          leg={leg ?? null}
                          locale={locale}
                          demoMode={routingDemo}
                          showSoftFail={selected && Boolean(leg)}
                          showEmpty={
                            selected &&
                            !routing &&
                            !leg &&
                            index < dayStops.length - 1
                          }
                        />
                      )}
                      {(stop.bookingLinks ?? []).length > 0 ? (
                        <View style={styles.bookingBlock}>
                          <Text style={styles.bookingTitle}>
                            {t(locale, "mobile.booking")}
                          </Text>
                          {(stop.bookingLinks ?? []).map((link) => (
                            <Pressable
                              key={`${link.kind}-${link.url}`}
                              style={styles.bookingChip}
                              onPress={() => void Linking.openURL(link.url)}
                            >
                              <Text style={styles.bookingChipText}>
                                {t(
                                  locale,
                                  `planner.booking.kind.${link.kind as BookingLinkKind}`,
                                )}
                                {link.providerLabel
                                  ? ` · ${link.providerLabel}`
                                  : ""}
                                {" · "}
                                {t(locale, "mobile.bookingOpen")}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {dayStops.length === 0 && (
                <View style={styles.emptyDay}>
                  <Text style={styles.emptyDayTitle}>
                    {t(locale, "planner.emptyDay")}
                  </Text>
                  <Text style={styles.emptyDayHint}>
                    {t(locale, "planner.emptyDayHint")}
                  </Text>
                  <Pressable
                    style={styles.emptyDayCta}
                    onPress={() => {
                      setSearchOpen(true);
                      searchInputRef.current?.focus();
                    }}
                  >
                    <Text style={styles.emptyDayCtaText}>
                      {t(locale, "planner.emptyDayCta")}
                    </Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.bookingPanelWrap}>
                <BookingPanel
                  tripId={tripId}
                  locale={locale}
                  trip={trip}
                  stop={
                    selectedStopId
                      ? (dayStops.find((s) => s.id === selectedStopId) ??
                        dayStops[0] ??
                        null)
                      : (dayStops[0] ?? null)
                  }
                  destinationHint={trip.destination}
                  defaultOpen
                  onSaved={(nextStop) => {
                    setStops((prev) =>
                      prev.map((s) => (s.id === nextStop.id ? nextStop : s)),
                    );
                    setTrip((prev) =>
                      prev
                        ? { ...prev, version: prev.version + 1 }
                        : prev,
                    );
                  }}
                />
              </View>
            </View>

            <View style={styles.dayFillWrap}>
              <DayFillPanel
                tripId={tripId}
                locale={locale}
                trip={trip}
                days={days}
                stops={stops}
                dayCountHint={days.length || 3}
                onApplied={async () => {
                  await load();
                }}
                onLocalApplied={({
                  trip: nextTrip,
                  days: nextDays,
                  stops: nextStops,
                }) => {
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
                  if (isApiSoftFail(new Error(message))) {
                    setSoftNotice(t(locale, "planner.demoLocal"));
                    setError(null);
                    return;
                  }
                  setError(message);
                }}
              />
            </View>

            <View style={styles.secondaryBlock}>
              <Pressable
                style={StyleSheet.flatten([
                  styles.pinBtn,
                  pinStatus?.pinned ? styles.pinBtnActive : null,
                ])}
                disabled={pinBusy}
                onPress={() => void onTogglePin()}
              >
                <Text
                  style={StyleSheet.flatten([
                    styles.pinLabel,
                    pinStatus?.pinned ? styles.pinLabelActive : null,
                  ])}
                >
                  {pinBusy
                    ? t(locale, "offline.working")
                    : pinStatus?.pinned
                      ? t(locale, "offline.pinned")
                      : t(locale, "offline.pin")}
                </Text>
                <Text
                  style={StyleSheet.flatten([
                    styles.pinMeta,
                    pinStatus?.pinned ? styles.pinMetaActive : null,
                  ])}
                >
                  {(pinStatus?.online ?? online)
                    ? t(locale, "offline.online")
                    : t(locale, "offline.offline")}
                  {(pinStatus?.pendingMutations ?? 0) > 0
                    ? ` · ${t(locale, "offline.pending").replace(
                        "{n}",
                        String(pinStatus?.pendingMutations ?? 0),
                      )}`
                    : ""}
                </Text>
              </Pressable>
              <Text style={styles.pinHint}>
                {t(locale, "offline.statusHint")}
              </Text>
              <SoftFailNotice
                open={Boolean(pinError)}
                style={styles.pinSoftFail}
              >
                {pinError ?? ""}
              </SoftFailNotice>

              <View style={styles.collabBox}>
                <Text style={styles.collabEyebrow}>
                  {t(locale, "collab.panel.eyebrow")}
                </Text>
                <Text style={styles.collabHeading}>
                  {t(locale, "collab.panel.title")}
                </Text>
                <Text style={styles.collabTitle}>
                  {t(locale, "collab.members")}
                </Text>
                <View
                  style={styles.presenceRow}
                  accessibilityRole="list"
                  accessibilityLabel={t(locale, "collab.members")}
                >
                  {members.slice(0, 4).map((m) => {
                    const presence = presenceFor(m.role);
                    const pulseOpacity =
                      presence === "active"
                        ? presencePulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.55, 1],
                          })
                        : 1;
                    return (
                      <View
                        key={m.id}
                        style={StyleSheet.flatten([
                          styles.presenceChip,
                          presence === "active"
                            ? styles.presenceChipActive
                            : null,
                        ])}
                        accessibilityLabel={`${m.displayName ?? m.userId} · ${t(locale, `collab.role.${m.role}`)} · ${t(locale, `collab.presence.${presence}`)}`}
                      >
                        <View
                          style={StyleSheet.flatten([
                            styles.presenceAvatar,
                            m.role === "viewer"
                              ? styles.presenceAvatarMuted
                              : null,
                          ])}
                        >
                          <Text style={styles.presenceInitials}>
                            {memberInitials(m.displayName ?? m.userId)}
                          </Text>
                          <Animated.View
                            style={StyleSheet.flatten([
                              styles.presenceDot,
                              presence === "active"
                                ? styles.presenceDotActive
                                : presence === "idle"
                                  ? styles.presenceDotIdle
                                  : styles.presenceDotAway,
                              { opacity: pulseOpacity },
                            ])}
                          />
                        </View>
                        <Text style={styles.presenceName} numberOfLines={1}>
                          {(m.displayName ?? m.userId).split(/\s+/)[0]}
                        </Text>
                        <Text
                          style={StyleSheet.flatten([
                            styles.presenceRole,
                            m.role === "owner"
                              ? styles.presenceRoleOwner
                              : m.role === "editor"
                                ? styles.presenceRoleEditor
                                : styles.presenceRoleViewer,
                          ])}
                        >
                          {t(locale, `collab.role.${m.role}`)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.collabMetaRow}>
                  <Text style={styles.collabMeta}>
                    {yourRole ? t(locale, `collab.role.${yourRole}`) : ""}
                    {collabSeeded
                      ? `${yourRole ? " · " : ""}${t(locale, "collab.demoBadge")}`
                      : ""}
                  </Text>
                  {members.length > 0 ? (
                    <View style={styles.liveBadge}>
                      <Animated.View
                        style={StyleSheet.flatten([
                          styles.liveDot,
                          {
                            opacity: presencePulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.45, 1],
                            }),
                          },
                        ])}
                      />
                      <Text style={styles.liveLabel}>
                        {t(locale, "collab.presence.live")}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Closed-bar SoftFailNotice — invite-scoped copy; rise in/out (#46) */}
                <SoftFailNotice
                  open={inviteSoftOpen && !inviteOpen}
                  style={styles.collabSoftFail}
                >
                  {inviteSoftCopy}
                </SoftFailNotice>

                {(yourRole === "owner" || yourRole === "editor") && (
                  <View style={styles.inviteActions}>
                    <Pressable
                      style={styles.inviteBtn}
                      onPress={() => void onInvite()}
                      accessibilityRole="button"
                    >
                      <Text style={styles.inviteLabel}>
                        {t(locale, "collab.invite")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.inviteToggle}
                      onPress={() => setInviteOpen((v) => !v)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.inviteToggleLabel}>
                        {inviteOpen
                          ? t(locale, "collab.hide")
                          : t(locale, "collab.show")}
                      </Text>
                    </Pressable>
                  </View>
                )}

                <SheetPresence
                  open={inviteOpen}
                  delayMs={40}
                  rise={14}
                  style={styles.inviteSheet}
                  accessibilityLabel={t(locale, "collab.invite")}
                >
                  {/* Azure invite chrome — SoftFailNotice under header rail */}
                  <View style={styles.inviteSheetHeader}>
                    <View style={styles.inviteSheetTitles}>
                      <Text style={styles.inviteSheetEyebrow}>
                        {t(locale, "collab.inviteEyebrow")}
                      </Text>
                      <Text style={styles.inviteSheetTitle}>
                        {t(locale, "collab.invite")}
                      </Text>
                    </View>
                    <View style={styles.inviteSheetBadges}>
                      {inviteSoftOpen ? (
                        <Text style={styles.inviteSoftBadge}>
                          {t(locale, "collab.demoBadge")}
                        </Text>
                      ) : null}
                      {inviteCode ? (
                        <Text style={styles.inviteRoleChip}>
                          {t(locale, "collab.role.editor")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <SoftFailNotice open={inviteSoftOpen} compact>
                    {inviteSoftCopy}
                  </SoftFailNotice>
                  <View style={styles.inviteSheetBody}>
                    {inviteCode ? (
                      <View style={styles.inviteShareBlock}>
                        <Text style={styles.inviteShareHint}>
                          {t(locale, "collab.shareHint")}
                        </Text>
                        <View style={styles.inviteCodeRow}>
                          <Text style={styles.inviteCodeChip}>
                            {inviteCode}
                          </Text>
                          <Pressable
                            style={styles.copyBtn}
                            onPress={() => void onCopyInvite()}
                            accessibilityRole="button"
                          >
                            <Text style={styles.copyBtnLabel}>
                              {inviteCopied
                                ? t(locale, "collab.copied")
                                : t(locale, "collab.copyLink")}
                            </Text>
                          </Pressable>
                        </View>
                        {inviteUrl ? (
                          <Text style={styles.inviteUrl}>{inviteUrl}</Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={styles.inviteShareHint}>
                        {t(locale, "collab.shareHint")}
                      </Text>
                    )}
                    <View style={styles.inviteMemberList}>
                      {members.map((m) => {
                        const presence = presenceFor(m.role);
                        return (
                          <View key={m.id} style={styles.inviteMemberRow}>
                            <View style={styles.inviteMemberLeft}>
                              <View
                                style={StyleSheet.flatten([
                                  styles.presenceAvatar,
                                  styles.presenceAvatarMd,
                                  m.role === "viewer"
                                    ? styles.presenceAvatarMuted
                                    : null,
                                ])}
                              >
                                <Text style={styles.presenceInitialsMd}>
                                  {memberInitials(m.displayName ?? m.userId)}
                                </Text>
                                <View
                                  style={StyleSheet.flatten([
                                    styles.presenceDot,
                                    presence === "active"
                                      ? styles.presenceDotActive
                                      : presence === "idle"
                                        ? styles.presenceDotIdle
                                        : styles.presenceDotAway,
                                  ])}
                                />
                              </View>
                              <Text
                                style={styles.inviteMemberName}
                                numberOfLines={1}
                              >
                                {m.displayName ?? m.userId}
                              </Text>
                            </View>
                            <Text
                              style={StyleSheet.flatten([
                                styles.presenceRole,
                                m.role === "owner"
                                  ? styles.presenceRoleOwner
                                  : m.role === "editor"
                                    ? styles.presenceRoleEditor
                                    : styles.presenceRoleViewer,
                              ])}
                            >
                              {t(locale, `collab.role.${m.role}`)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </SheetPresence>

                {comments.length > 0 ? (
                  <View style={styles.collabThread}>
                    <Text style={styles.collabSectionLabel}>
                      {t(locale, "collab.panel.tab.comments")}
                    </Text>
                    {comments.slice(0, 3).map((c) => (
                      <View key={c.id} style={styles.commentRail}>
                        <Text style={styles.commentAuthor}>
                          {c.authorDisplayName ?? c.authorUserId}
                        </Text>
                        <Text style={styles.commentBody}>{c.body}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {activity.length > 0 ? (
                  <View style={styles.collabThread}>
                    <Text style={styles.collabSectionLabel}>
                      {t(locale, "collab.panel.tab.activity")}
                    </Text>
                    {activity.slice(0, 4).map((ev) => (
                      <View key={ev.id} style={styles.activityRail}>
                        <View style={styles.activityMeta}>
                          <Text style={styles.activityType}>
                            {t(locale, `collab.activity.${ev.type}`)}
                          </Text>
                          {ev.actorDisplayName ? (
                            <Text style={styles.activityActor}>
                              {ev.actorDisplayName}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.activitySummary}>{ev.summary}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  skyWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    borderBottomWidth: 100,
    borderBottomColor: "rgba(219, 232, 255, 0.65)",
  },
  header: {
    marginBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingBottom: 16,
  },
  brandLine: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 10,
  },
  title: {
    ...type.display,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.9,
    color: colors.ink,
    marginBottom: 8,
  },
  support: {
    ...type.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
    marginBottom: 16,
    maxWidth: 360,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingVertical: 13,
    alignItems: "center",
  },
  actionPrimary: {
    backgroundColor: colors.river,
    borderColor: colors.river,
  },
  actionOutline: {
    backgroundColor: colors.foam,
    borderColor: "rgba(47, 107, 255, 0.4)",
  },
  actionLabel: {
    ...type.body,
    color: colors.ink,
    fontWeight: "600",
    fontSize: 13,
  },
  actionPrimaryLabel: {
    color: colors.foam,
    fontWeight: "700",
  },
  actionOutlineLabel: {
    color: colors.river,
    fontWeight: "700",
  },
  softBanner: {
    marginBottom: 14,
  },
  bookingPanelWrap: {
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  errorBanner: {
    borderRadius: radius.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.timber,
    backgroundColor: "rgba(225, 29, 72, 0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 360,
    width: "100%",
  },
  errorBannerText: {
    ...type.body,
    fontSize: 13,
    color: colors.timber,
  },
  sheet: {
    marginTop: 2,
    marginBottom: 20,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    overflow: "hidden",
  },
  dayRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    /* Mist wash rail — not full pill (web .bp-day-tab-rail--underline). */
    backgroundColor: "rgba(230, 236, 245, 0.55)",
  },
  dayRowContent: {
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 0,
    minWidth: "100%",
  },
  dayRailInner: {
    position: "relative",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
  },
  dayUnderline: {
    position: "absolute",
    bottom: 0,
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.river,
    /* Soft azure edge — matches web gradient underline. */
    shadowColor: colors.river,
    shadowOpacity: 0.18,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 0,
  },
  dayChip: {
    position: "relative",
    zIndex: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    backgroundColor: "transparent",
  },
  dayChipActive: {
    backgroundColor: "rgba(47, 107, 255, 0.08)",
  },
  dayChipEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    color: colors.inkSoft,
    opacity: 0.72,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  dayChipEyebrowActive: {
    color: colors.river,
    opacity: 1,
  },
  dayChipDate: {
    ...type.body,
    marginTop: 2,
    fontSize: 13,
    color: colors.inkSoft,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  dayChipDateActive: {
    color: colors.ink,
    fontWeight: "700",
  },
  /* Transit filter chips — mist-track · azure select (web #129). */
  modeFilter: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  modeFilterHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
    rowGap: 4,
    paddingHorizontal: 2,
  },
  modeEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
  },
  modeSupport: {
    ...type.body,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(100, 116, 139, 0.8)",
  },
  modeSelectedBadge: {
    borderRadius: radius.xs,
    backgroundColor: "rgba(47, 107, 255, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  modeSelectedBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  modeFilterBody: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 10,
    rowGap: 8,
  },
  modeMistTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.55)",
    padding: 4,
  },
  modeChip: {
    borderRadius: radius.xs,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "transparent",
  },
  modeChipOn: {
    backgroundColor: colors.foam,
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    /* Azure ring — web ring-river/25 */
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47, 107, 255, 0.25)",
  },
  modeChipLabel: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  modeChipLabelOn: {
    color: colors.river,
    fontWeight: "700",
  },
  modeGenerate: {
    borderRadius: radius.md,
    backgroundColor: colors.river,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: colors.river,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  modeGenerateDisabled: {
    opacity: 0.4,
  },
  modeGenerateLabel: {
    ...type.body,
    fontSize: 13,
    fontWeight: "700",
    color: colors.foam,
  },
  modeLegSummary: {
    ...type.body,
    fontSize: 13,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
    paddingVertical: 2,
  },
  modeDemoBadge: {
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modeDemoBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  searchWrap: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    zIndex: 5,
  },
  searchInput: {
    ...type.body,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    paddingRight: 40,
  },
  searchSpinner: {
    position: "absolute",
    right: 26,
    top: 26,
  },
  searchSheet: {
    marginTop: 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    overflow: "hidden",
  },
  searchSheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
  },
  searchSheetHeadText: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    flexShrink: 1,
  },
  searchEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  searchCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(100, 116, 139, 0.85)",
  },
  searchBadge: {
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  searchBadgeDemo: {
    backgroundColor: colors.mist,
  },
  searchBadgeLive: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  searchBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  searchBadgeTextDemo: {
    color: colors.inkSoft,
  },
  searchBadgeTextLive: {
    color: colors.riverDeep,
  },
  searchHits: {
    paddingVertical: 4,
  },
  searchHit: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  searchHitSelected: {
    backgroundColor: "rgba(47, 107, 255, 0.1)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    paddingLeft: 9,
  },
  searchHitLast: {},
  searchHitIndex: {
    marginTop: 1,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mist,
  },
  searchHitIndexSelected: {
    backgroundColor: colors.river,
  },
  searchHitIndexText: {
    ...type.body,
    fontSize: 11,
    fontWeight: "800",
    color: colors.inkSoft,
  },
  searchHitIndexTextSelected: {
    color: colors.foam,
  },
  searchHitBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  searchHitName: {
    ...type.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  searchHitAddr: {
    ...type.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkSoft,
  },
  searchHitHint: {
    ...type.body,
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "rgba(100, 116, 139, 0.5)",
  },
  searchHitHintSelected: {
    color: colors.river,
  },
  searchEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 6,
  },
  searchEmptyTitle: {
    ...type.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  searchEmptyHint: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  searchLoading: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchLoadingText: {
    ...type.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  stopRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  stopRowSelected: {
    backgroundColor: "rgba(47,107,255,0.06)",
  },
  stopIndex: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.river,
    alignItems: "center",
    justifyContent: "center",
  },
  stopIndexSelected: {
    backgroundColor: colors.riverDeep,
  },
  stopIndexText: {
    ...type.body,
    fontWeight: "800",
    color: colors.foam,
    fontSize: 12,
  },
  stopBody: { flex: 1 },
  stopName: {
    ...type.display,
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  stopAddr: {
    ...type.body,
    marginTop: 3,
    fontSize: 12,
    color: colors.inkSoft,
  },
  bookingBlock: { marginTop: 8, gap: 6 },
  bookingTitle: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  bookingChip: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47,107,255,0.35)",
    backgroundColor: "rgba(47,107,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bookingChipText: {
    ...type.body,
    fontSize: 12,
    color: colors.river,
    fontWeight: "600",
  },
  dayFillWrap: {
    marginTop: 16,
    marginBottom: 8,
  },
  secondaryBlock: {
    marginTop: 4,
  },
  pinBtn: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47, 107, 255, 0.35)",
    backgroundColor: colors.foam,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pinBtnActive: {
    backgroundColor: colors.river,
    borderColor: colors.river,
  },
  pinLabel: {
    ...type.body,
    fontSize: 14,
    fontWeight: "700",
    color: colors.river,
  },
  pinLabelActive: {
    color: colors.foam,
  },
  pinMeta: {
    ...type.body,
    marginTop: 4,
    fontSize: 12,
    color: colors.inkSoft,
  },
  pinMetaActive: {
    color: "rgba(255,255,255,0.78)",
  },
  pinHint: {
    ...type.body,
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  pinSoftFail: {
    marginBottom: 18,
  },
  collabBox: {
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 6,
  },
  collabEyebrow: {
    ...type.body,
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    fontWeight: "700",
    color: colors.river,
  },
  collabHeading: {
    ...type.display,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
    marginBottom: 4,
  },
  collabTitle: {
    ...type.body,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.river,
  },
  collabMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  collabMeta: {
    ...type.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(47,107,255,0.1)",
    borderRadius: radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.river,
  },
  liveLabel: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    color: colors.riverDeep,
  },
  presenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  presenceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 148,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 8,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
  },
  presenceChipActive: {
    borderColor: "rgba(47,107,255,0.35)",
  },
  presenceAvatar: {
    position: "relative",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.river,
  },
  presenceAvatarMd: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  presenceAvatarMuted: {
    backgroundColor: colors.inkSoft,
  },
  presenceDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.foam,
  },
  presenceDotActive: {
    backgroundColor: colors.river,
  },
  presenceDotIdle: {
    backgroundColor: colors.focus,
  },
  presenceDotAway: {
    backgroundColor: colors.inkSoft,
    opacity: 0.85,
  },
  presenceInitials: {
    color: colors.foam,
    fontSize: 9,
    fontWeight: "700",
  },
  presenceInitialsMd: {
    color: colors.foam,
    fontSize: 11,
    fontWeight: "700",
  },
  presenceName: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
  },
  presenceRole: {
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  presenceRoleOwner: {
    backgroundColor: colors.river,
    color: colors.foam,
  },
  presenceRoleEditor: {
    backgroundColor: "rgba(47,107,255,0.12)",
    color: colors.riverDeep,
  },
  presenceRoleViewer: {
    backgroundColor: colors.mist,
    color: colors.inkSoft,
  },
  collabSoftFail: {
    marginTop: 6,
  },
  collabThread: {
    marginTop: 10,
    gap: 8,
  },
  collabSectionLabel: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.river,
  },
  commentRail: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(47,107,255,0.4)",
    paddingLeft: 10,
    gap: 2,
  },
  commentAuthor: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  commentBody: {
    ...type.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  activityRail: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(47,107,255,0.28)",
    paddingLeft: 10,
    gap: 2,
  },
  activityMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  activityType: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.riverDeep,
    backgroundColor: "rgba(47,107,255,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  activityActor: {
    ...type.body,
    fontSize: 11,
    fontWeight: "500",
    color: colors.inkSoft,
  },
  activitySummary: {
    ...type.body,
    fontSize: 13,
    fontWeight: "500",
    color: colors.ink,
  },
  inviteActions: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  inviteBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.river,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: colors.river,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  inviteLabel: {
    ...type.body,
    color: colors.foam,
    fontWeight: "700",
    fontSize: 13,
  },
  inviteToggle: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inviteToggleLabel: {
    ...type.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  inviteSheet: {
    marginTop: 10,
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    shadowColor: colors.ink,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  inviteSheetHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  inviteSheetTitles: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  inviteSheetEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
  },
  inviteSheetTitle: {
    ...type.body,
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(71, 85, 105, 0.8)",
  },
  inviteSheetBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  inviteSoftBadge: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSoft,
    backgroundColor: colors.mist,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  inviteRoleChip: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.riverDeep,
    backgroundColor: "rgba(47,107,255,0.12)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  inviteSheetBody: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  inviteShareBlock: {
    gap: 10,
  },
  inviteShareHint: {
    ...type.display,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  inviteCodeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  inviteCodeChip: {
    fontFamily: "monospace",
    fontSize: 14,
    letterSpacing: 1.4,
    color: colors.riverDeep,
    backgroundColor: "rgba(47,107,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  copyBtn: {
    backgroundColor: colors.river,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  copyBtnLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 13,
    fontWeight: "700",
  },
  inviteUrl: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(71, 85, 105, 0.85)",
  },
  inviteMemberList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 10,
    gap: 4,
  },
  inviteMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 6,
  },
  inviteMemberLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
  },
  inviteMemberName: {
    ...type.body,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },

  hint: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  emptyDay: {
    paddingHorizontal: 14,
    paddingVertical: 22,
    maxWidth: 360,
  },
  emptyDayTitle: {
    ...type.display,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  emptyDayHint: {
    ...type.body,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  emptyDayCta: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: colors.river,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
  emptyDayCtaText: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
  },
  retry: {
    marginTop: 8,
    backgroundColor: colors.river,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  retryLabel: {
    ...type.body,
    color: colors.foam,
    fontWeight: "700",
  },
});
