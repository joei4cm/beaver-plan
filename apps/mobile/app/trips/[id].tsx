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
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailBandStyle,
  softFailLiveBadgeLabelStyle,
  softFailLiveBadgeStyle,
  softFailMistWashStyle,
} from "../../src/components/soft-fail-notice";
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

/** Craft SoftFail query parity with web (`?stopsSoftFail=1` / `?dragSoftFail=1` / `?dayFillSoftFail=1` / `?otaSoftFail=1` / `?confirmSoftFail=1` / `?presenceSoftFail=1` / `?inviteSoftFail=1` / `?timelineSoftFail=1` / `?modeSoftFail=1` / `?transferSoftFail=1` / `?searchSoftFail=1` / `?placeSoftFail=1` / `?daysSoftFail=1` / `?emptySoftFail=1` / `?pinSoftFail=1`). */
function craftSoftFailOn(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1";
}

export default function TripDetailScreen() {
  const router = useRouter();
  const {
    id,
    stopsSoftFail: stopsSoftFailParam,
    dragSoftFail: dragSoftFailParam,
    dayFillSoftFail: dayFillSoftFailParam,
    otaSoftFail: otaSoftFailParam,
    confirmSoftFail: confirmSoftFailParam,
    presenceSoftFail: presenceSoftFailParam,
    inviteSoftFail: inviteSoftFailParam,
    timelineSoftFail: timelineSoftFailParam,
    modeSoftFail: modeSoftFailParam,
    transferSoftFail: transferSoftFailParam,
    searchSoftFail: searchSoftFailParam,
    placeSoftFail: placeSoftFailParam,
    daysSoftFail: daysSoftFailParam,
    emptySoftFail: emptySoftFailParam,
    pinSoftFail: pinSoftFailParam,
  } = useLocalSearchParams<{
    id: string;
    stopsSoftFail?: string | string[];
    dragSoftFail?: string | string[];
    dayFillSoftFail?: string | string[];
    otaSoftFail?: string | string[];
    confirmSoftFail?: string | string[];
    presenceSoftFail?: string | string[];
    inviteSoftFail?: string | string[];
    timelineSoftFail?: string | string[];
    modeSoftFail?: string | string[];
    transferSoftFail?: string | string[];
    searchSoftFail?: string | string[];
    placeSoftFail?: string | string[];
    daysSoftFail?: string | string[];
    emptySoftFail?: string | string[];
    pinSoftFail?: string | string[];
  }>();
  const tripId = typeof id === "string" ? id : "sample-kyoto";
  /** Craft preview: /trips/…?stopsSoftFail=1 — SoftFail depth under stop chips. */
  const stopsSoftPreview = craftSoftFailOn(stopsSoftFailParam);
  /** Craft preview: /trips/…?dragSoftFail=1 — SoftFail depth under Stops without a reorder. */
  const dragSoftPreview = craftSoftFailOn(dragSoftFailParam);
  /** Craft preview: /trips/…?dayFillSoftFail=1 — SoftFail depth under Day fill (BEA-408). */
  const dayFillSoftPreview = craftSoftFailOn(dayFillSoftFailParam);
  /** Craft preview: /trips/…?otaSoftFail=1 — SoftFail depth under booking OTA (BEA-418). */
  const otaSoftPreview = craftSoftFailOn(otaSoftFailParam);
  /** Craft preview: /trips/…?confirmSoftFail=1 — SoftFail depth under booking Confirm (BEA-418). */
  const confirmSoftPreview = craftSoftFailOn(confirmSoftFailParam);
  /** Craft preview: /trips/…?presenceSoftFail=1 — SoftFail depth under Presence (BEA-420). */
  const presenceSoftPreview = craftSoftFailOn(presenceSoftFailParam);
  /** Craft preview: /trips/…?inviteSoftFail=1 — SoftFail depth under Invite (BEA-420). */
  const inviteSoftPreview = craftSoftFailOn(inviteSoftFailParam);
  /** Craft preview: /trips/…?timelineSoftFail=1 — SoftFail depth under Timeline (BEA-420). */
  const timelineSoftPreview = craftSoftFailOn(timelineSoftFailParam);
  /** Craft preview: /trips/…?modeSoftFail=1 — SoftFail depth under Mode rail (BEA-423). */
  const modeSoftPreview = craftSoftFailOn(modeSoftFailParam);
  /** Craft preview: /trips/…?transferSoftFail=1 — SoftFail depth under Transfer (BEA-423). */
  const transferSoftPreview = craftSoftFailOn(transferSoftFailParam);
  /** Craft preview: /trips/…?searchSoftFail=1 — SoftFail depth under Places search (BEA-422). */
  const searchSoftPreview = craftSoftFailOn(searchSoftFailParam);
  /** Craft preview: /trips/…?placeSoftFail=1 — SoftFail depth under Place intel (BEA-422). */
  const placeSoftPreview = craftSoftFailOn(placeSoftFailParam);
  /** Craft preview: /trips/…?daysSoftFail=1 — SoftFail depth under Days (BEA-429). */
  const daysSoftPreview = craftSoftFailOn(daysSoftFailParam);
  /** Craft preview: /trips/…?emptySoftFail=1 — SoftFail depth under empty Stops (BEA-429). */
  const emptySoftPreview = craftSoftFailOn(emptySoftFailParam);
  /** Craft preview: /trips/…?pinSoftFail=1 — SoftFail depth under Offline pin (BEA-450). */
  const pinSoftPreview = craftSoftFailOn(pinSoftFailParam);
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

  /** Craft SoftFail: `?inviteSoftFail=1` opens invite sheet with demo code. */
  useEffect(() => {
    if (!inviteSoftPreview) return;
    seedDemoInvite();
  }, [inviteSoftPreview]);

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
      // SoftFail pin SoftFailNotice always soft i18n (BEA-441) — never e.message.
      if (isNoiseError(e)) {
        setSoftNotice(t(locale, "planner.demoLocal"));
        setPinError(null);
      } else {
        setPinError(t(locale, "offline.pinSoftFail"));
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
  /** Per-day stop counts for day-tab meta (BEA-258 / web #188). */
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
  /**
   * Places search SoftFail helpers + craft SoftFail query parity (BEA-422):
   * SoftFailBadge · SoftFailSupport · SoftFailNotice mist band · tip-011
   * mist-wash. Craft: /trips/…?searchSoftFail=1 forces SoftFail under Places
   * when the sheet is open (mirrors web map-chrome). SoftFail copy never
   * timber / Failed to fetch.
   */
  const searchOwnsSoftFail =
    (searchDemo || searchSoftPreview) && searchSheetOpen;

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

  /**
   * Presence SoftFail helpers (BEA-392 / yield #281) + craft SoftFail query
   * parity (BEA-420): SoftFailBadge · SoftFailSupport · mist SoftFail band ·
   * tip-011 mist-wash chips. Craft: /trips/…?presenceSoftFail=1. Yields while
   * invite sheet SoftFail owns — no double depth. SoftFail copy never timber /
   * Failed to fetch.
   */
  const presenceSoftOpen =
    (collabSeeded || collabSoftOffline || presenceSoftPreview) && !inviteOpen;
  const presenceSoftCopy =
    collabSoftOffline || presenceSoftPreview
      ? t(locale, "collab.presenceSoftFail")
      : t(locale, "collab.presenceDemoNotice");
  const presenceActiveCount = members.filter(
    (m) => presenceFor(m.role) === "active",
  ).length;
  /**
   * Invite SoftFail helpers (BEA-392 / yield #281) + craft SoftFail query
   * parity (BEA-420): SoftFailBadge · SoftFailSupport · compact SoftFail under
   * azure rail. Craft: /trips/…?inviteSoftFail=1. Presence SoftFail yields while
   * invite open. Soft copy never timber / Failed to fetch.
   */
  const inviteSoftOpen =
    collabSeeded || collabSoftOffline || inviteSoftPreview;
  const inviteSoftCopy =
    collabSoftOffline || inviteSoftPreview
      ? t(locale, "collab.inviteSoftFail")
      : t(locale, "collab.inviteDemoNotice");

  /**
   * Expo collab SoftFail depth kept (BEA-392 / BEA-420 / yield #281) + wave 50
   * craft residual: Timeline (BEA-479) + Comments preview eyebrow (BEA-487).
   * SoftFailBadge · SoftFailSupport · mist band · tip-011 mist-wash unchanged.
   * Craft: /trips/…?timelineSoftFail=1. Soft copy never timber / Failed to fetch.
   * Yields while invite SoftFail owns (no double depth). No `/dev` gallery.
   */
  const timelineSoftNoise =
    collabSeeded || collabSoftOffline || timelineSoftPreview;
  const timelineSoftOpen = timelineSoftNoise && !inviteOpen;
  const timelineSoftCopy =
    collabSoftOffline || timelineSoftPreview
      ? t(locale, "collab.panel.timelineSoftFail")
      : t(locale, "collab.panel.timelineDemoNotice");
  const timelineSupportCopy = timelineSoftOpen
    ? t(locale, "collab.panel.timelineSoftSupport")
    : t(locale, "collab.panel.timelineSupport");
  const timelineCount = t(locale, "collab.panel.count").replace(
    "{n}",
    String(activity.length),
  );
  const showTimeline = activity.length > 0 || timelineSoftNoise;

  /** Title + stop-list chrome hierarchy after web #105 / Expo #148. */
  const dayEmpty = dayStops.length === 0;
  const detailDemo =
    Boolean(softNotice) ||
    tripId === "sample-kyoto" ||
    routingDemo ||
    searchDemo;
  const detailStatus: "offline" | "demo" | "live" =
    !online || fromCache ? "offline" : detailDemo ? "demo" : "live";
  const detailSoftNoise =
    Boolean(softNotice) || fromCache || !online || detailDemo;
  /**
   * Expo trip-detail SoftFailNotice depth (BEA-298 after #194 / BEA-253) +
   * craft SoftFail query parity (BEA-384 / BEA-429 residual):
   * azure Stops rail · Soft/empty/reorder badge · softSupport · compact SoftFailNotice
   * mist band under rail (`border-b`) · softFailMistWashStyle tip-011 chips /
   * empty body · StyleSheet.flatten.
   * Craft: /trips/…?stopsSoftFail=1 · /trips/…?dragSoftFail=1 ·
   * /trips/…?emptySoftFail=1 — mirrors web planner. Empty day still owns SoftFail.
   * Drag SoftFail yields chips SoftFail (no double depth). Title SoftFail yields
   * while Stops owns. SoftFail copy always emptySoftFail / stops.softFail /
   * dragSoftFail (never inherit softNotice). Soft copy never timber / Failed to
   * fetch. Journal empty SoftFail craft stays on /journal (BEA-428).
   */
  const emptyOwnsSoft = dayEmpty;
  const dragSoftFailCopy = t(locale, "planner.stops.dragSoftFail");
  const dragOwnsSoft =
    !dayEmpty && (dragSoftPreview || softNotice === dragSoftFailCopy);
  const stopsOwnsSoft = !dayEmpty && !dragOwnsSoft;
  const stopsSoftOpen = emptyOwnsSoft
    ? Boolean(emptySoftPreview || detailSoftNoise)
    : dragOwnsSoft
      ? true
      : Boolean(
          stopsSoftPreview ||
            softNotice ||
            fromCache ||
            !online ||
            (detailDemo && (dayLegs.length > 0 || dayStops.length > 0)),
        );
  /** SoftFail copy owned by Stops chrome — never inherit softNotice / timber. */
  const stopsSoftCopy = emptyOwnsSoft
    ? t(locale, "planner.emptySoftFail")
    : dragOwnsSoft
      ? dragSoftFailCopy
      : t(locale, "planner.stops.softFail");
  const stopsSoftSupport = emptyOwnsSoft
    ? t(locale, "planner.emptySoftSupport")
    : dragOwnsSoft
      ? t(locale, "planner.stops.dragSoftSupport")
      : t(locale, "planner.stops.softSupport");
  /** Title SoftFail yields while Stops rail owns soft-fail (empty / drag / chips). */
  const detailSoftOpen =
    !emptyOwnsSoft && !dragOwnsSoft && !stopsOwnsSoft && detailSoftNoise;
  const detailSoftCopy =
    !online || fromCache
      ? (softNotice ?? t(locale, "planner.demoLocal"))
      : (softNotice ?? "");
  /**
   * Expo day tabs SoftFailNotice depth (BEA-299 after #196 / BEA-258) + craft
   * SoftFail query residual (BEA-429): Days rail owns compact SoftFail under
   * azure Days chrome · Soft days badge · softSupport · tip-011 SheetPresence
   * mist tabs · StyleSheet.flatten. Craft: /trips/…?daysSoftFail=1. SoftFail
   * yields while invite sheet open (no double depth). Soft copy never timber /
   * Failed to fetch. Stops SoftFail stays under Stops (sibling rail).
   */
  const daysSoftOpen =
    (daysSoftPreview || detailSoftNoise) && !inviteOpen;
  const daysSoftCopy = t(locale, "planner.days.softFail");
  /**
   * Expo Offline pin SoftFail depth kept (BEA-448 / BEA-450) + wave 49 craft
   * (BEA-474 / #343) + wave 52 residual (BEA-499): always-on azure offline pin
   * rail · tip-011 pin press · Lumen tokens · status leading-relaxed.
   * SoftFailBadge Soft pin · SoftFailSupport · mist band unchanged. Craft:
   * /trips/…?pinSoftFail=1 — SoftFail depth without a pin miss. Soft copy
   * always offline.pinSoftFail — never timber / Failed to fetch. No `/dev`
   * gallery.
   */
  const pinSoftOpen = pinSoftPreview || Boolean(pinError);
  const pinSoftCopy = pinError ?? t(locale, "offline.pinSoftFail");
  const pinStatusLabel = [
    (pinStatus?.online ?? online)
      ? t(locale, "offline.online")
      : t(locale, "offline.offline"),
    (pinStatus?.pendingMutations ?? 0) > 0
      ? t(locale, "offline.pending").replace(
          "{n}",
          String(pinStatus?.pendingMutations ?? 0),
        )
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const selectedDayIndex = dayId
    ? Math.max(1, days.findIndex((d) => d.id === dayId) + 1)
    : 0;
  const selectedStop = selectedStopId
    ? dayStops.find((s) => s.id === selectedStopId)
    : undefined;

  /**
   * Expo transit filters SoftFailNotice depth (BEA-342 after #221 / BEA-289) +
   * craft SoftFail query parity (BEA-423): Mode rail owns SoftFail when demo
   * legs exist / `?modeSoftFail=1` and TransferSteps does not own selected-stop
   * soft chrome. Soft mode badge · softSupport · compact SoftFail mist band
   * (`border-b`) · tip-011 mist-wash SheetPresence · StyleSheet.flatten.
   * SoftFail yields while TransferSteps / `?transferSoftFail=1` owns (no double
   * depth). Soft copy never timber / Failed to fetch. No `/dev` SoftFail gallery.
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
    transferSurfaceOpen && (transferSoftPreview || routingDemo);
  const modeSoftOpen =
    !transitSoftOwns &&
    (modeSoftPreview || (routingDemo && dayLegs.length > 0));
  const modeSoftCopy = t(locale, "planner.mode.softFail");
  const modeSoftSupport = t(locale, "planner.mode.softSupport");

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
          <Pressable
            style={StyleSheet.flatten([styles.retry])}
            onPress={() => void load()}
          >
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

          {/*
            Title rail — azure inset · Demo/Live/Offline chip · SoftFailNotice ·
            tip-011 rise. Craft residual (BEA-465 / BEA-503): display weight 700 ·
            brand 0.65rem tracking · title lineHeight 40 · support inkSoft ·
            soft-shadow primary CTA · pressed scale.
          */}
          <Animated.View
            style={StyleSheet.flatten([styles.header, riseStyle])}
          >
            <View style={styles.titleRail}>
              <Text style={styles.brandLine} numberOfLines={1}>
                Beaver Plan ·{" "}
                {trip.destination ?? t(locale, "planner.trip")}
              </Text>
              <View
                style={StyleSheet.flatten([
                  styles.statusChip,
                  detailStatus === "offline"
                    ? styles.statusChipOffline
                    : detailStatus === "demo"
                      ? styles.statusChipDemo
                      : styles.statusChipLive,
                ])}
              >
                <Text
                  style={StyleSheet.flatten([
                    styles.statusChipText,
                    detailStatus === "offline"
                      ? styles.statusChipTextOffline
                      : detailStatus === "demo"
                        ? styles.statusChipTextDemo
                        : styles.statusChipTextLive,
                  ])}
                >
                  {detailStatus === "offline"
                    ? t(locale, "offline.offline")
                    : detailStatus === "demo"
                      ? t(locale, "trips.listDemo")
                      : t(locale, "trips.listLive")}
                </Text>
              </View>
            </View>
            <Text style={styles.title}>{trip.title}</Text>
            {formatTripSupport(trip) ? (
              <Text style={styles.support}>{formatTripSupport(trip)}</Text>
            ) : null}
            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) =>
                  StyleSheet.flatten([
                    styles.actionBtn,
                    styles.actionPrimary,
                    pressed ? styles.actionBtnPressed : null,
                  ])
                }
                onPress={() => router.push(`/trips/${tripId}/share`)}
                accessibilityRole="button"
                accessibilityLabel={t(locale, "mobile.share")}
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
                style={({ pressed }) =>
                  StyleSheet.flatten([
                    styles.actionBtn,
                    styles.actionOutline,
                    pressed ? styles.actionBtnPressed : null,
                  ])
                }
                onPress={() => router.push(`/trips/${tripId}/journal`)}
                accessibilityRole="button"
                accessibilityLabel={t(locale, "mobile.journal")}
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
                style={({ pressed }) =>
                  StyleSheet.flatten([
                    styles.actionBtn,
                    pressed ? styles.actionBtnPressed : null,
                  ])
                }
                onPress={() => router.push("/translate")}
                accessibilityRole="button"
                accessibilityLabel={t(locale, "mobile.translate")}
              >
                <Text style={styles.actionLabel}>
                  {t(locale, "mobile.translate")}
                </Text>
              </Pressable>
            </View>
            {/* Title SoftFail yields while Stops rail owns soft-fail. */}
            <SoftFailNotice
              open={detailSoftOpen}
              compact
              style={styles.softBanner}
            >
              {detailSoftCopy}
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
              {/*
                Day tabs SoftFail helpers (BEA-388 after #284 / BEA-299):
                azure Days rail · SoftFailBadge · SoftFailSupport ·
                SoftFailNotice mist band · tip-011 SheetPresence mist tabs ·
                StyleSheet.flatten. SoftFail yields while invite open. Never
                timber / Failed to fetch.
              */}
              <View
                style={styles.daysChrome}
                accessibilityLabel={t(locale, "planner.days.eyebrow")}
              >
                <View style={styles.daysRail}>
                  <View style={styles.daysRailCopy}>
                    <Text style={styles.daysEyebrow}>
                      {t(locale, "planner.days.eyebrow")}
                    </Text>
                    <Text style={styles.daysCount}>
                      {t(locale, "planner.days.count").replace(
                        "{n}",
                        String(days.length),
                      )}
                    </Text>
                    {daysSoftOpen ? (
                      <SoftFailSupport
                        style={styles.softSupportShrink}
                        numberOfLines={1}
                      >
                        {t(locale, "planner.days.softSupport")}
                      </SoftFailSupport>
                    ) : (
                      <Text style={styles.daysSupport} numberOfLines={1}>
                        {t(locale, "planner.days.support")}
                      </Text>
                    )}
                  </View>
                  {daysSoftOpen ? (
                    <SoftFailBadge>
                      {t(locale, "planner.days.softBadge")}
                    </SoftFailBadge>
                  ) : dayId ? (
                    <View style={styles.daysSelectedBadge}>
                      <Text style={styles.daysSelectedBadgeText}>
                        {t(locale, "planner.day")} {selectedDayIndex} ·{" "}
                        {t(locale, "planner.days.selected")}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.daysListHint}>
                      {t(locale, "planner.dayFill.days")}
                    </Text>
                  )}
                </View>

                {/* Compact SoftFail under azure Days rail — never timber. */}
                <SoftFailNotice
                  open={daysSoftOpen}
                  compact
                  style={softFailBandStyle}
                >
                  {daysSoftCopy}
                </SoftFailNotice>

                <SheetPresence
                  open
                  delayMs={40}
                  rise={8}
                  accessibilityLabel={t(locale, "planner.days.eyebrow")}
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={StyleSheet.flatten([
                      styles.dayRow,
                      daysSoftOpen ? styles.dayRowSoft : null,
                    ])}
                    contentContainerStyle={styles.dayRowContent}
                    accessibilityRole="tablist"
                    accessibilityLabel={t(locale, "planner.days.eyebrow")}
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
                        const stopCount = dayStopCounts.get(day.id) ?? 0;
                        return (
                          <Pressable
                            key={day.id}
                            onPress={() => selectDay(day.id)}
                            onLayout={(e) => {
                              const { x, width } = e.nativeEvent.layout;
                              dayTabLayouts.current.set(day.id, { x, width });
                              if (day.id === dayId) {
                                applyDayUnderline(
                                  day.id,
                                  dayUnderlineReady.current,
                                );
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
                            <Text
                              style={StyleSheet.flatten([
                                styles.dayChipMeta,
                                active ? styles.dayChipMetaActive : null,
                              ])}
                            >
                              {stopCount > 0
                                ? t(locale, "planner.days.stopsMeta").replace(
                                    "{n}",
                                    String(stopCount),
                                  )
                                : t(locale, "planner.days.stopsMetaEmpty")}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </SheetPresence>
              </View>

              {/*
                Transit Mode rail craft residual (BEA-511 / wave 53) beyond
                #337 / Transfer #358 + SoftFail kept (BEA-388 / BEA-423) +
                Mode generate press (BEA-503): azure Mode rail · eyebrow
                tracking 1.8 · SoftFailBadge · SoftFailSupport · SoftFailNotice
                mist band · tip-011 mist-wash SheetPresence · generate tip-011
                press. Craft: ?modeSoftFail=1. Yields while TransferSteps /
                ?transferSoftFail=1 owns. Never timber / Failed to fetch. No
                `/dev` gallery.
              */}
              <View style={styles.modeFilter}>
                <View
                  style={StyleSheet.flatten([
                    styles.modeFilterHead,
                    modeSoftOpen ? styles.modeFilterHeadSoft : null,
                  ])}
                >
                  <Text style={styles.modeEyebrow}>
                    {t(locale, "planner.mode.eyebrow")}
                  </Text>
                  {modeSoftOpen ? (
                    <SoftFailSupport
                      style={styles.softSupportShrink}
                      numberOfLines={1}
                    >
                      {modeSoftSupport}
                    </SoftFailSupport>
                  ) : (
                    <Text style={styles.modeSupport} numberOfLines={1}>
                      {t(locale, "planner.mode.support")}
                    </Text>
                  )}
                  {modeSoftOpen ? (
                    <SoftFailBadge>
                      {t(locale, "planner.mode.softBadge")}
                    </SoftFailBadge>
                  ) : (
                    <View style={styles.modeSelectedBadge}>
                      <Text style={styles.modeSelectedBadgeText}>
                        {t(locale, `planner.mode.${travelMode}`)} ·{" "}
                        {t(locale, "planner.mode.selected")}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Compact SoftFail mist band under azure mode rail — never timber. */}
                <SoftFailNotice
                  open={modeSoftOpen}
                  compact
                  style={softFailBandStyle}
                >
                  {modeSoftCopy}
                </SoftFailNotice>

                <SheetPresence
                  open
                  rise={8}
                  delayMs={40}
                  accessibilityLabel={t(locale, "planner.mode.filterLabel")}
                >
                  <View
                    style={StyleSheet.flatten([
                      styles.modeFilterBody,
                      modeSoftOpen
                        ? [softFailMistWashStyle, styles.modeFilterBodySoft]
                        : null,
                    ])}
                  >
                    <View
                      style={StyleSheet.flatten([
                        styles.modeMistTrack,
                        modeSoftOpen ? styles.modeMistTrackSoft : null,
                      ])}
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
                      style={({ pressed }) =>
                        StyleSheet.flatten([
                          styles.modeGenerate,
                          routing || dayStops.length < 2
                            ? styles.modeGenerateDisabled
                            : null,
                          /* tip-011 press — web Mode generate active:scale (#337) */
                          pressed &&
                          !(routing || dayStops.length < 2)
                            ? styles.modeGeneratePressed
                            : null,
                        ])
                      }
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
                  </View>
                </SheetPresence>
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
                        ) : showSearchEmpty ? (
                          <Text style={styles.searchCount}>
                            {t(locale, "planner.search.emptyCount")}
                          </Text>
                        ) : null}
                        {searchOwnsSoftFail ? (
                          <SoftFailSupport style={styles.softSupportShrink}>
                            {t(locale, "planner.search.softSupport")}
                          </SoftFailSupport>
                        ) : (
                          <Text style={styles.searchSupport}>
                            {t(locale, "planner.search.support")}
                          </Text>
                        )}
                      </View>
                      {searchOwnsSoftFail ? (
                        <SoftFailBadge>
                          {t(locale, "planner.search.softBadge")}
                        </SoftFailBadge>
                      ) : searchDemo ? (
                        <SoftFailBadge>
                          {t(locale, "planner.search.demoBadge")}
                        </SoftFailBadge>
                      ) : (
                        <SoftFailLiveBadge>
                          {t(locale, "planner.search.liveBadge")}
                        </SoftFailLiveBadge>
                      )}
                    </View>

                    {hasSearchResults ? (
                      <View
                        style={StyleSheet.flatten([
                          styles.searchHits,
                          searchOwnsSoftFail ? softFailMistWashStyle : null,
                        ])}
                      >
                        {results.map((place, i) => {
                          const selected = i === activeIndex;
                          return (
                            <Pressable
                              key={place.enginePlaceId}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => void addPlace(place)}
                              onPressIn={() => setActiveIndex(i)}
                              style={({ pressed }) =>
                                StyleSheet.flatten([
                                  styles.searchHit,
                                  selected ? styles.searchHitSelected : null,
                                  i === results.length - 1
                                    ? styles.searchHitLast
                                    : null,
                                  pressed ? styles.searchHitPressed : null,
                                ])
                              }
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
                      <View
                        style={StyleSheet.flatten([
                          styles.searchEmpty,
                          searchOwnsSoftFail ? softFailMistWashStyle : null,
                        ])}
                        accessibilityRole="summary"
                      >
                        <Text style={styles.searchEmptyEyebrow}>
                          {t(locale, "planner.search.emptyEyebrow")}
                        </Text>
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
                      open={searchOwnsSoftFail && hasSearchResults}
                      compact
                      style={softFailBandStyle}
                    >
                      {t(locale, "planner.search.softFail")}
                    </SoftFailNotice>
                    <SoftFailNotice
                      open={searchOwnsSoftFail && showSearchEmpty}
                      compact
                      style={softFailBandStyle}
                    >
                      {t(locale, "planner.search.softFailEmpty")}
                    </SoftFailNotice>
                  </View>
                ) : null}
              </View>

              {/*
                Stops SoftFail helpers (BEA-388 after #284 / BEA-298 + #282):
                SoftFailBadge (Soft/empty/reorder) · SoftFailSupport ·
                SoftFailNotice mist band · tip-011 softFailMistWashStyle chips.
                Craft: ?stopsSoftFail=1 · ?dragSoftFail=1. Soft copy never timber
                / Failed to fetch.
              */}
              <View style={styles.stopsChrome}>
                <View
                  style={StyleSheet.flatten([
                    styles.stopsRail,
                    stopsSoftOpen ? styles.stopsRailSoft : null,
                  ])}
                >
                  <View style={styles.stopsRailCopy}>
                    <Text style={styles.stopsEyebrow}>
                      {t(locale, "planner.stops.eyebrow")}
                    </Text>
                    <Text style={styles.stopsCount}>
                      {dayEmpty
                        ? t(locale, "planner.emptyDay")
                        : t(locale, "planner.stops.count").replace(
                            "{n}",
                            String(dayStops.length),
                          )}
                    </Text>
                    {stopsSoftOpen ? (
                      <SoftFailSupport
                        style={styles.softSupportShrink}
                        numberOfLines={1}
                      >
                        {stopsSoftSupport}
                      </SoftFailSupport>
                    ) : (
                      <Text style={styles.stopsSupport} numberOfLines={1}>
                        {dayEmpty
                          ? t(locale, "planner.emptySupport")
                          : t(locale, "planner.stops.support")}
                      </Text>
                    )}
                  </View>
                  <View style={styles.stopsRailBadges}>
                    {dayEmpty ? (
                      stopsSoftOpen ? (
                        <SoftFailBadge>
                          {t(locale, "planner.emptySoftBadge")}
                        </SoftFailBadge>
                      ) : (
                        <View
                          style={StyleSheet.flatten([
                            styles.stopsEmptyBadge,
                            styles.stopsEmptyBadgeLive,
                          ])}
                        >
                          <Text
                            style={StyleSheet.flatten([
                              styles.stopsEmptyBadgeText,
                              styles.stopsEmptyBadgeTextLive,
                            ])}
                          >
                            {t(locale, "planner.emptyBadge")}
                          </Text>
                        </View>
                      )
                    ) : (
                      <>
                        {selectedStop && !dragOwnsSoft ? (
                          <View style={styles.stopsSelectedBadge}>
                            <Text
                              style={styles.stopsSelectedBadgeText}
                              numberOfLines={1}
                            >
                              {selectedStop.place.name} ·{" "}
                              {t(locale, "planner.stops.selected")}
                            </Text>
                          </View>
                        ) : !dragOwnsSoft ? (
                          <Text style={styles.stopsListHint}>
                            {t(locale, "planner.stopsList")}
                          </Text>
                        ) : null}
                        {stopsSoftOpen ? (
                          <SoftFailBadge>
                            {dragOwnsSoft
                              ? t(locale, "planner.stops.dragSoftBadge")
                              : t(locale, "planner.stops.softBadge")}
                          </SoftFailBadge>
                        ) : (
                          <SoftFailLiveBadge>
                            {t(locale, "planner.stops.liveBadge")}
                          </SoftFailLiveBadge>
                        )}
                      </>
                    )}
                  </View>
                </View>

                {/* Compact SoftFail mist band under azure Stops rail — never timber. */}
                <SoftFailNotice
                  open={stopsSoftOpen}
                  compact
                  style={softFailBandStyle}
                >
                  {stopsSoftCopy}
                </SoftFailNotice>

                {!dayEmpty ? (
                  <SheetPresence
                    open
                    delayMs={40}
                    rise={8}
                    style={
                      stopsSoftOpen ? softFailMistWashStyle : undefined
                    }
                  >
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.stopChipScroll}
                      contentContainerStyle={StyleSheet.flatten([
                        styles.stopChipTrack,
                        stopsSoftOpen ? styles.stopChipTrackSoft : null,
                      ])}
                      accessibilityRole="tablist"
                      accessibilityLabel={t(
                        locale,
                        "planner.stops.filterLabel",
                      )}
                    >
                      {dayStops.map((stop, i) => {
                        const on = selectedStopId === stop.id;
                        return (
                          <Pressable
                            key={stop.id}
                            onPress={() => selectStop(stop.id)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={t(
                              locale,
                              "planner.stops.chip",
                            ).replace("{n}", String(i + 1))}
                            style={StyleSheet.flatten([
                              styles.stopChip,
                              on ? styles.stopChipOn : null,
                            ])}
                          >
                            <Animated.View
                              style={StyleSheet.flatten([
                                styles.stopChipIndex,
                                on ? styles.stopChipIndexOn : null,
                                on
                                  ? { transform: [{ scale: stopPop }] }
                                  : null,
                              ])}
                            >
                              <Text
                                style={StyleSheet.flatten([
                                  styles.stopChipIndexText,
                                  on ? styles.stopChipIndexTextOn : null,
                                ])}
                              >
                                {i + 1}
                              </Text>
                            </Animated.View>
                            <Text
                              style={StyleSheet.flatten([
                                styles.stopChipLabel,
                                on ? styles.stopChipLabelOn : null,
                              ])}
                              numberOfLines={1}
                            >
                              {stop.place.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </SheetPresence>
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
                      style={StyleSheet.flatten([
                        styles.stopIndex,
                        selected ? styles.stopIndexSelected : null,
                        selected
                          ? { transform: [{ scale: stopPop }] }
                          : null,
                      ])}
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
                          craftPlaceSoftFail={placeSoftPreview}
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
                          craftSoftFail={selected && transferSoftPreview}
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
                              style={StyleSheet.flatten([styles.bookingChip])}
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
                <View
                  style={StyleSheet.flatten([
                    styles.emptyDay,
                    /* tip-011 softFailMistWashStyle empty body while SoftFail owns (web softFailMistWashClass). */
                    stopsSoftOpen ? softFailMistWashStyle : null,
                  ])}
                >
                  {/*
                    Empty-day craft residual (BEA-465) — web empty stop:
                    river Stops eyebrow · display title · relaxed hint ·
                    shadow-bp-soft CTA · tip-011 SheetPresence rise. SoftFail
                    mist wash stays on the outer shell; SoftFail depth unchanged.
                  */}
                  <SheetPresence
                    open
                    delayMs={40}
                    rise={8}
                    accessibilityLabel={t(locale, "planner.emptyDay")}
                  >
                    <Text style={styles.emptyDayEyebrow}>
                      {t(locale, "planner.stops.eyebrow")}
                    </Text>
                    <Text style={styles.emptyDayTitle}>
                      {t(locale, "planner.emptyDay")}
                    </Text>
                    <Text style={styles.emptyDayHint}>
                      {t(locale, "planner.emptyDayHint")}
                    </Text>
                    <Pressable
                      style={({ pressed }) =>
                        StyleSheet.flatten([
                          styles.emptyDayCta,
                          pressed ? styles.emptyDayCtaPressed : null,
                        ])
                      }
                      onPress={() => {
                        setSearchOpen(true);
                        searchInputRef.current?.focus();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t(locale, "planner.emptyDayCta")}
                    >
                      <Text style={styles.emptyDayCtaText}>
                        {t(locale, "planner.emptyDayCta")}
                      </Text>
                    </Pressable>
                  </SheetPresence>
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
                  craftOtaSoftFail={otaSoftPreview}
                  craftConfirmSoftFail={confirmSoftPreview}
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
                craftSoftFail={dayFillSoftPreview}
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
              {/*
                SoftFail kept (BEA-448 / BEA-450) + wave 49 (#343) + wave 52
                (BEA-499): always-on azure offline pin rail · tip-011 pin press ·
                Lumen tokens · status leading-relaxed · SoftFailBadge Soft pin ·
                SoftFailSupport · mist band. Craft: ?pinSoftFail=1 — SoftFail
                depth without a pin miss. Soft copy never timber / Failed to
                fetch. No `/dev` gallery.
              */}
              <View
                style={StyleSheet.flatten([
                  styles.pinChrome,
                  pinSoftOpen ? styles.pinChromeSoft : null,
                ])}
                accessibilityLabel={t(locale, "offline.pinRail")}
              >
                <View
                  style={StyleSheet.flatten([
                    styles.pinRail,
                    pinSoftOpen ? styles.pinRailSoft : null,
                    pinSoftOpen ? softFailBandStyle : null,
                  ])}
                >
                  <View style={styles.pinSoftRailCopy}>
                    <Text style={styles.pinSoftEyebrow}>
                      {t(locale, "offline.pinRail")}
                    </Text>
                    {pinSoftOpen ? (
                      <SoftFailSupport
                        style={styles.softSupportShrink}
                        numberOfLines={2}
                      >
                        {t(locale, "offline.softSupport")}
                      </SoftFailSupport>
                    ) : (
                      <Text style={styles.pinRailStatus} numberOfLines={1}>
                        {pinStatusLabel}
                      </Text>
                    )}
                  </View>
                  {pinSoftOpen ? (
                    <SoftFailBadge>
                      {t(locale, "offline.softBadge")}
                    </SoftFailBadge>
                  ) : null}
                </View>
                <SoftFailNotice
                  open={pinSoftOpen}
                  compact
                  style={styles.pinSoftFail}
                  fallback={pinSoftCopy}
                >
                  {pinSoftCopy}
                </SoftFailNotice>
                <View
                  style={StyleSheet.flatten([
                    styles.pinBody,
                    pinSoftOpen ? softFailMistWashStyle : null,
                  ])}
                >
                  <Pressable
                    disabled={pinBusy}
                    onPress={() => void onTogglePin()}
                    accessibilityRole="button"
                    accessibilityLabel={
                      pinBusy
                        ? t(locale, "offline.working")
                        : pinStatus?.pinned
                          ? t(locale, "offline.pinned")
                          : t(locale, "offline.pin")
                    }
                    style={({ pressed }) =>
                      StyleSheet.flatten([
                        styles.pinBtn,
                        pinStatus?.pinned ? styles.pinBtnActive : null,
                        pressed && !pinBusy ? styles.pinBtnPressed : null,
                      ])
                    }
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
                      {pinStatusLabel}
                    </Text>
                  </Pressable>
                  <Text style={styles.pinHint}>
                    {t(locale, "offline.statusHint")}
                  </Text>
                </View>
              </View>

              <View style={styles.collabBox}>
                <Text style={styles.collabEyebrow}>
                  {t(locale, "collab.panel.eyebrow")}
                </Text>
                <Text style={styles.collabHeading}>
                  {t(locale, "collab.panel.title")}
                </Text>

                {/*
                  Presence SoftFail helpers kept (BEA-392 / BEA-420 / yield #281) +
                  wave 48 invite residual (BEA-461) + wave 51 presence pills craft
                  (BEA-493): eyebrow 1.8 · chip/role type · list status pills.
                  SoftFailBadge · SoftFailSupport · mist band unchanged. Craft:
                  ?presenceSoftFail=1 — never timber.
                */}
                <View
                  style={styles.presenceChrome}
                  accessibilityLabel={t(locale, "collab.presence.eyebrow")}
                >
                  <View style={styles.presenceRail}>
                    <View style={styles.presenceRailCopy}>
                      <Text style={styles.presenceEyebrow}>
                        {t(locale, "collab.presence.eyebrow")}
                      </Text>
                      <Text style={styles.presenceCount}>
                        {t(locale, "collab.presence.count").replace(
                          "{n}",
                          String(members.length),
                        )}
                      </Text>
                      {presenceSoftOpen ? (
                        <SoftFailSupport
                          style={styles.softSupportShrink}
                          numberOfLines={2}
                        >
                          {t(locale, "collab.presence.softSupport")}
                        </SoftFailSupport>
                      ) : (
                        <Text style={styles.presenceSupport} numberOfLines={2}>
                          {t(locale, "collab.presence.support")}
                        </Text>
                      )}
                    </View>
                    <View style={styles.presenceRailBadges}>
                      {yourRole ? (
                        <Text
                          style={StyleSheet.flatten([
                            styles.presenceRole,
                            yourRole === "owner"
                              ? styles.presenceRoleOwner
                              : yourRole === "editor"
                                ? styles.presenceRoleEditor
                                : styles.presenceRoleViewer,
                          ])}
                        >
                          {t(locale, `collab.role.${yourRole}`)}
                        </Text>
                      ) : null}
                      {presenceSoftOpen ? (
                        <SoftFailBadge>
                          {t(locale, "collab.presence.softBadge")}
                        </SoftFailBadge>
                      ) : (
                        <View
                          style={StyleSheet.flatten([
                            styles.presenceStatusBadge,
                            members.length > 0
                              ? softFailLiveBadgeStyle
                              : styles.presenceStatusBadgeIdle,
                          ])}
                        >
                          {members.length > 0 ? (
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
                          ) : null}
                          <Text
                            style={StyleSheet.flatten([
                              styles.presenceStatusBadgeText,
                              members.length > 0
                                ? softFailLiveBadgeLabelStyle
                                : styles.presenceStatusBadgeTextIdle,
                            ])}
                          >
                            {t(locale, "collab.presence.live")}
                            {presenceActiveCount > 0
                              ? ` · ${presenceActiveCount}`
                              : ""}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Compact SoftFail mist band under azure Presence rail — never timber. */}
                  <SoftFailNotice
                    open={presenceSoftOpen}
                    compact
                    style={softFailBandStyle}
                  >
                    {presenceSoftCopy}
                  </SoftFailNotice>

                  <SheetPresence
                    open
                    delayMs={40}
                    rise={8}
                    style={StyleSheet.flatten([
                      styles.presenceBody,
                      presenceSoftOpen ? softFailMistWashStyle : null,
                    ])}
                    accessibilityLabel={t(locale, "collab.members")}
                  >
                    <View
                      style={StyleSheet.flatten([
                        styles.presenceTrack,
                        presenceSoftOpen ? styles.presenceTrackSoft : null,
                      ])}
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
                      {members.length === 0 ? (
                        <Text style={styles.presenceEmpty}>
                          {t(locale, "collab.presence.empty")}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.collabMetaRow}>
                      <Text style={styles.collabMeta}>
                        {yourRole ? t(locale, `collab.role.${yourRole}`) : ""}
                        {collabSeeded
                          ? `${yourRole ? " · " : ""}${t(locale, "collab.demoBadge")}`
                          : ""}
                      </Text>
                    </View>
                  </SheetPresence>
                </View>

                {(yourRole === "owner" || yourRole === "editor") && (
                  <View style={styles.inviteActions}>
                    <Pressable
                      style={({ pressed }) =>
                        StyleSheet.flatten([
                          styles.inviteBtn,
                          pressed ? styles.inviteCtaPressed : null,
                        ])
                      }
                      onPress={() => void onInvite()}
                      accessibilityRole="button"
                    >
                      <Text style={styles.inviteLabel}>
                        {t(locale, "collab.invite")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) =>
                        StyleSheet.flatten([
                          styles.inviteToggle,
                          pressed ? styles.inviteCtaPressed : null,
                        ])
                      }
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
                  {/*
                    Invite SoftFail helpers kept (BEA-392 / BEA-420 / yield #281) +
                    wave 48 craft residual (BEA-461) + wave 53 residual (BEA-506):
                    paper/inkSoft/foam token alphas · tip-011 Invite/Copy press ·
                    shareHint lineHeight. SoftFailBadge · SoftFailSupport · mist
                    band unchanged. Craft: ?inviteSoftFail=1.
                  */}
                  <View style={styles.inviteSheetHeader}>
                    <View style={styles.inviteSheetTitles}>
                      <Text style={styles.inviteSheetEyebrow}>
                        {t(locale, "collab.inviteEyebrow")}
                      </Text>
                      {inviteSoftOpen ? (
                        <SoftFailSupport>
                          {t(locale, "collab.inviteSoftSupport")}
                        </SoftFailSupport>
                      ) : (
                        <Text style={styles.inviteSheetSupport}>
                          {t(locale, "collab.inviteSupport")}
                        </Text>
                      )}
                    </View>
                    <View style={styles.inviteSheetBadges}>
                      {inviteSoftOpen ? (
                        <SoftFailBadge>
                          {t(locale, "collab.inviteSoftBadge")}
                        </SoftFailBadge>
                      ) : (
                        <SoftFailLiveBadge>
                          {t(locale, "collab.inviteLiveBadge")}
                        </SoftFailLiveBadge>
                      )}
                      {inviteCode ? (
                        <Text style={styles.inviteRoleChip}>
                          {t(locale, "collab.role.editor")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {/* Compact SoftFail under azure invite rail — never timber / Failed to fetch. */}
                  <SoftFailNotice
                    open={inviteSoftOpen}
                    compact
                    style={softFailBandStyle}
                  >
                    {inviteSoftCopy}
                  </SoftFailNotice>
                  <View
                    style={StyleSheet.flatten([
                      styles.inviteSheetBody,
                      inviteSoftOpen ? softFailMistWashStyle : null,
                    ])}
                  >
                    {inviteCode ? (
                      <SheetPresence
                        open
                        delayMs={40}
                        rise={10}
                        style={StyleSheet.flatten([
                          styles.inviteCodeInset,
                          inviteSoftOpen ? styles.inviteCodeInsetSoft : null,
                        ])}
                      >
                        <Text style={styles.inviteCodeEyebrow}>
                          {t(locale, "collab.inviteCodeEyebrow")}
                        </Text>
                        <SheetPresence open delayMs={80} rise={8}>
                          <Text style={styles.inviteShareHint}>
                            {t(locale, "collab.shareHint")}
                          </Text>
                        </SheetPresence>
                        <SheetPresence
                          open
                          delayMs={120}
                          rise={8}
                          style={styles.inviteCodeRow}
                        >
                          <Text style={styles.inviteCodeChip}>
                            {inviteCode}
                          </Text>
                          <Pressable
                            style={({ pressed }) =>
                              StyleSheet.flatten([
                                styles.copyBtn,
                                pressed ? styles.inviteCtaPressed : null,
                              ])
                            }
                            onPress={() => void onCopyInvite()}
                            accessibilityRole="button"
                          >
                            <Text style={styles.copyBtnLabel}>
                              {inviteCopied
                                ? t(locale, "collab.copied")
                                : t(locale, "collab.copyLink")}
                            </Text>
                          </Pressable>
                        </SheetPresence>
                        {inviteUrl ? (
                          <SheetPresence open delayMs={160} rise={6}>
                            <Text style={styles.inviteUrl}>{inviteUrl}</Text>
                          </SheetPresence>
                        ) : null}
                      </SheetPresence>
                    ) : (
                      <SheetPresence open delayMs={40} rise={8}>
                        <Text style={styles.inviteShareHintMuted}>
                          {t(locale, "collab.shareHint")}
                        </Text>
                      </SheetPresence>
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
                              <View style={styles.inviteMemberCopy}>
                                <Text
                                  style={styles.inviteMemberName}
                                  numberOfLines={1}
                                >
                                  {m.displayName ?? m.userId}
                                </Text>
                                <Text
                                  style={StyleSheet.flatten([
                                    styles.presenceStatePill,
                                    presence === "active"
                                      ? styles.presenceStateActive
                                      : presence === "idle"
                                        ? styles.presenceStateIdle
                                        : styles.presenceStateAway,
                                  ])}
                                >
                                  {t(locale, `collab.presence.${presence}`)}
                                </Text>
                              </View>
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
                {showTimeline ? (
                  <SheetPresence
                    open
                    delayMs={40}
                    rise={12}
                    style={styles.timelineSheet}
                    accessibilityLabel={t(locale, "collab.panel.tab.activity")}
                  >
                    {/*
                      Timeline SoftFail depth kept (BEA-392 / BEA-420 / yield #281) +
                      wave 50 craft residual (BEA-479): eyebrow 1.8 · paper/foam
                      tokens · tip-011 rise stagger. SoftFailBadge · SoftFailSupport ·
                      softFailBandStyle · softFailMistWashStyle unchanged. Yields
                      invite SoftFail while sheet open. Craft: ?timelineSoftFail=1 —
                      never timber / Failed to fetch. No `/dev` gallery.
                    */}
                    <View
                      style={StyleSheet.flatten([
                        styles.timelineHeader,
                        timelineSoftOpen ? styles.timelineHeaderSoft : null,
                      ])}
                    >
                      <View style={styles.timelineHeaderRow}>
                        <View style={styles.timelineTitles}>
                          <Text style={styles.timelineEyebrow}>
                            {t(locale, "collab.panel.timelineEyebrow")}
                          </Text>
                          <Text style={styles.timelineCount}>
                            {timelineCount}
                          </Text>
                        </View>
                        {timelineSoftOpen ? (
                          <SoftFailBadge>
                            {t(locale, "collab.panel.timelineSoftBadge")}
                          </SoftFailBadge>
                        ) : (
                          <SoftFailLiveBadge>
                            {t(locale, "collab.panel.liveBadge")}
                          </SoftFailLiveBadge>
                        )}
                      </View>
                      {timelineSoftOpen ? (
                        <SoftFailSupport>{timelineSupportCopy}</SoftFailSupport>
                      ) : (
                        <Text style={styles.timelineSupport}>
                          {timelineSupportCopy}
                        </Text>
                      )}
                    </View>
                    {/* Compact SoftFail mist band under azure Timeline rail. */}
                    <SoftFailNotice
                      open={timelineSoftOpen}
                      compact
                      style={softFailBandStyle}
                    >
                      {timelineSoftCopy}
                    </SoftFailNotice>
                    <View
                      style={StyleSheet.flatten([
                        styles.timelineBody,
                        timelineSoftOpen ? softFailMistWashStyle : null,
                      ])}
                    >
                      {activity.slice(0, 4).map((ev, i) => (
                        <SheetPresence
                          key={ev.id}
                          open
                          delayMs={Math.min(i, 8) * 35 + 70}
                          rise={8}
                          style={styles.activityRail}
                        >
                          <View style={styles.activityMeta}>
                            {i === 0 ? (
                              <Text style={styles.activityNow}>
                                {t(locale, "collab.panel.timelineNow")}
                              </Text>
                            ) : null}
                            <Text style={styles.activityType}>
                              {t(locale, `collab.activity.${ev.type}`)}
                            </Text>
                            {ev.actorDisplayName ? (
                              <Text style={styles.activityActor}>
                                {ev.actorDisplayName}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.activitySummary}>
                            {ev.summary}
                          </Text>
                        </SheetPresence>
                      ))}
                    </View>
                  </SheetPresence>
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
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    backgroundColor: "rgba(244, 246, 250, 0.55)",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: radius.md,
  },
  titleRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  brandLine: {
    ...type.body,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.6,
    textTransform: "uppercase",
    color: colors.river,
  },
  statusChip: {
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusChipOffline: {
    backgroundColor: colors.mist,
  },
  statusChipDemo: {
    backgroundColor: colors.mist,
  },
  statusChipLive: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  statusChipText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  statusChipTextOffline: {
    color: colors.inkSoft,
  },
  statusChipTextDemo: {
    color: colors.inkSoft,
  },
  statusChipTextLive: {
    color: colors.river,
  },
  title: {
    ...type.display,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.7,
    /* Display settle — Expo home hero lineHeight bar (BEA-494 / BEA-503). */
    lineHeight: 40,
    color: colors.ink,
    marginBottom: 8,
  },
  support: {
    ...type.body,
    fontSize: 14,
    lineHeight: 22,
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
  actionBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  actionPrimary: {
    backgroundColor: colors.river,
    borderColor: colors.river,
    shadowColor: colors.river,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
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
    letterSpacing: 0.2,
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
    marginTop: 12,
    marginBottom: 0,
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
    /* Lumen soft elevation — web map|list shadow-bp */
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  /* Azure Days chrome — web .bp-day-tabs-chrome (BEA-258 / #188). */
  daysChrome: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  daysRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 8,
    rowGap: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  daysRailCopy: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
    rowGap: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  daysEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
  },
  daysCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: "rgba(100, 116, 139, 0.8)",
  },
  daysSupport: {
    ...type.body,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(100, 116, 139, 0.8)",
    flexShrink: 1,
  },
  /** Layout-only shrink for SoftFailSupport beside azure rail titles. */
  softSupportShrink: {
    flexShrink: 1,
  },
  daysSelectedBadge: {
    borderRadius: radius.xs,
    backgroundColor: "rgba(47, 107, 255, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  daysSelectedBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  daysListHint: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(100, 116, 139, 0.55)",
  },
  dayRow: {
    /* Mist wash rail — not full pill (web .bp-day-tab-rail--underline). */
    backgroundColor: "rgba(230, 236, 245, 0.62)",
  },
  /** Azure inset mist track when Days SoftFail open (depth craft). */
  dayRowSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.78)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  dayRowContent: {
    paddingHorizontal: 6,
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
    /* Soft azure edge + depth — matches web underline shadow. */
    shadowColor: colors.river,
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
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
    /* Foam / river wash — web selected tab. */
    backgroundColor: "rgba(255, 255, 255, 0.88)",
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
  dayChipMeta: {
    ...type.body,
    marginTop: 3,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"],
    color: colors.inkSoft,
    opacity: 0.72,
  },
  dayChipMetaActive: {
    color: colors.river,
    opacity: 0.9,
  },
  /* Transit Mode rail — azure inset · mist chips (web BEA-511 / #337). */
  modeFilter: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
  },
  modeFilterHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
    rowGap: 4,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  /** Soft azure mode rail wash when SoftFail owns depth (BEA-342). */
  modeFilterHeadSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.35)",
  },
  /** Mode rail eyebrow — Transfer #358 tracking 1.8 parity (BEA-511). */
  modeEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  modeSupport: {
    ...type.body,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(100, 116, 139, 0.8)",
    flexShrink: 1,
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
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.river,
  },
  modeFilterBody: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 10,
    rowGap: 8,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
  },
  /** SoftFail mode body — mist density from softFailMistWashStyle (tip-011 /25). */
  modeFilterBodySoft: {
    borderRadius: radius.sm,
  },
  modeMistTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.55)",
    padding: 4,
  },
  /** Azure inset mist track when Mode SoftFail open (depth craft). */
  modeMistTrackSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.78)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
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
  /* tip-011 press — parity with web Mode generate active:scale-[0.98] (#337). */
  modeGeneratePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  modeGenerateDisabled: {
    opacity: 0.4,
  },
  modeGenerateLabel: {
    ...type.body,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: colors.foam,
  },
  modeLegSummary: {
    ...type.body,
    fontSize: 13,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
    paddingVertical: 2,
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
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchSheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingLeft: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.8)",
    /* Azure Places inset — web map-chrome Places rail */
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
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
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  searchCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(100, 116, 139, 0.85)",
  },
  searchSupport: {
    ...type.body,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(15, 23, 42, 0.55)",
    flexShrink: 1,
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
  /* tip-011 press — parity with web Places active:scale-[0.995] (#341) */
  searchHitPressed: {
    transform: [{ scale: 0.995 }],
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
  searchEmptyEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: "rgba(47,107,255,0.8)",
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
  /* Stop list chrome — azure rail · mist-track chips (web #105). */
  stopsChrome: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  stopsRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  stopsRailSoft: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.85)",
  },
  stopsRailCopy: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  stopsEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
  },
  stopsCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    color: "rgba(100, 116, 139, 0.85)",
  },
  stopsSupport: {
    ...type.body,
    fontSize: 11,
    color: "rgba(100, 116, 139, 0.8)",
    flexShrink: 1,
  },
  stopsRailBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  stopsEmptyBadge: {
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stopsEmptyBadgeLive: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  stopsEmptyBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  stopsEmptyBadgeTextLive: {
    color: colors.river,
  },
  stopsSelectedBadge: {
    maxWidth: 160,
    borderRadius: radius.xs,
    backgroundColor: "rgba(47, 107, 255, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stopsSelectedBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  stopsListHint: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(100, 116, 139, 0.55)",
  },
  stopChipScroll: {
    maxHeight: 44,
  },
  stopChipTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginHorizontal: 10,
    marginBottom: 10,
    marginTop: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.5)",
  },
  stopChipTrackSoft: {
    marginLeft: 12,
    backgroundColor: "rgba(230, 236, 245, 0.55)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  stopChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 176,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.xs,
    backgroundColor: "transparent",
  },
  stopChipOn: {
    backgroundColor: colors.foam,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47, 107, 255, 0.25)",
    // Soft Lumen lift — selected chip over Mist track
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  stopChipIndex: {
    width: 20,
    height: 20,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.1)",
  },
  stopChipIndexOn: {
    backgroundColor: colors.river,
  },
  stopChipIndexText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: colors.inkSoft,
  },
  stopChipIndexTextOn: {
    color: colors.foam,
  },
  stopChipLabel: {
    ...type.body,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  stopChipLabelOn: {
    color: colors.river,
    fontWeight: "700",
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
    backgroundColor: "rgba(47,107,255,0.08)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    paddingLeft: 11,
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
  /** Offline pin chrome — always-on azure rail (#343 / BEA-499) · SoftFail wash. */
  pinChrome: {
    marginBottom: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.foam,
  },
  pinChromeSoft: {
    backgroundColor: colors.paper,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  pinRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 8,
    rowGap: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.paper,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  pinRailSoft: {
    borderLeftWidth: 0,
    /** SoftFail rail wash — mist token (parity prior SoftFail pin chrome). */
    backgroundColor: colors.mist,
  },
  pinSoftRailCopy: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
    rowGap: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  pinSoftEyebrow: {
    ...type.body,
    fontSize: 10.4,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  pinRailStatus: {
    ...type.body,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.2,
    lineHeight: 16,
    color: colors.inkSoft,
    flexShrink: 1,
    minWidth: 0,
  },
  pinBody: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  pinBtn: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pinBtnPressed: {
    transform: [{ scale: 0.98 }],
  },
  pinBtnActive: {
    backgroundColor: colors.river,
    borderColor: colors.river,
  },
  pinLabel: {
    ...type.body,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.river,
  },
  pinLabelActive: {
    color: colors.foam,
  },
  pinMeta: {
    ...type.body,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  pinMetaActive: {
    color: colors.foam,
  },
  pinHint: {
    ...type.body,
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  pinSoftFail: {
    marginBottom: 0,
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
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.river,
  },
  /* Azure Presence chrome — web TripMembersBar SoftFail depth (BEA-374 / #141). */
  presenceChrome: {
    marginTop: 4,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  presenceRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 8,
    rowGap: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
  },
  presenceRailCopy: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
    rowGap: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  /** Presence eyebrow — wave 51 craft residual (BEA-493): 1.8 tracking bar. */
  presenceEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  presenceCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: "rgba(100, 116, 139, 0.8)",
  },
  presenceSupport: {
    ...type.body,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(100, 116, 139, 0.8)",
    flexShrink: 1,
  },
  presenceRailBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  presenceStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  presenceStatusBadgeIdle: {
    backgroundColor: "rgba(230, 236, 245, 0.7)",
  },
  presenceStatusBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  presenceStatusBadgeTextIdle: {
    color: "rgba(100, 116, 139, 0.7)",
  },
  presenceBody: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  presenceTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    borderRadius: radius.sm,
    padding: 4,
    backgroundColor: "rgba(230, 236, 245, 0.5)",
  },
  /** Azure inset mist track when Presence SoftFail open. */
  presenceTrackSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.72)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  presenceEmpty: {
    ...type.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  presenceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 148,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 8,
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
  },
  presenceChipActive: {
    borderColor: "rgba(47, 107, 255, 0.28)",
    shadowColor: colors.river,
    shadowOpacity: 0.14,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
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
    letterSpacing: -0.15,
    color: colors.ink,
  },
  /** Role pill on presence chips — wave 51 (BEA-493) type bar. */
  presenceRole: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
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
  /** List status pills — web PRESENCE_PILL parity (BEA-493). */
  presenceStatePill: {
    ...type.body,
    alignSelf: "flex-start",
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  presenceStateActive: {
    backgroundColor: "rgba(47,107,255,0.12)",
    color: colors.riverDeep,
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
  },
  presenceStateIdle: {
    backgroundColor: "rgba(96,165,250,0.15)",
    color: colors.riverDeep,
    borderLeftWidth: 2,
    borderLeftColor: colors.focus,
  },
  presenceStateAway: {
    backgroundColor: colors.mist,
    color: colors.inkSoft,
  },
  collabThread: {
    marginTop: 10,
    gap: 8,
  },
  /** Comments preview eyebrow — wave 50 craft residual (BEA-487): 1.8 tracking. */
  collabSectionLabel: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  /** Azure rail @ 40% — matches web border-river/40 (colors.river #2F6BFF). */
  commentRail: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(47, 107, 255, 0.4)",
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
  /** Timeline sheet — azure rail · mist SoftFail · tip-011 (BEA-371 / BEA-479). */
  timelineSheet: {
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
  timelineHeader: {
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  /** Soft azure Timeline rail wash when SoftFail owns depth (BEA-371). */
  timelineHeaderSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.88)",
  },
  timelineHeaderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timelineTitles: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  timelineEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  timelineCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    color: colors.inkSoft,
  },
  timelineSupport: {
    ...type.body,
    fontSize: 11,
    lineHeight: 17,
    color: colors.inkSoft,
    maxWidth: 420,
  },
  timelineBody: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    backgroundColor: "rgba(230, 236, 245, 0.18)",
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
  activityNow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.river,
    backgroundColor: "rgba(47,107,255,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    overflow: "hidden",
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
  },
  activityType: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
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
    lineHeight: 18,
    letterSpacing: -0.15,
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
  /* tip-011 press — parity with web Invite/Copy active:scale-[0.98] (BEA-506). */
  inviteCtaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  inviteSheet: {
    marginTop: 10,
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    /** Web bg-foam/95 */
    backgroundColor: `${colors.foam}F2`,
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
    /** Web bg-paper/70 */
    backgroundColor: `${colors.paper}B3`,
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
  inviteSheetSupport: {
    ...type.body,
    fontSize: 11,
    lineHeight: 16,
    color: `${colors.inkSoft}CC`,
  },
  inviteSheetBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  inviteRoleChip: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.riverDeep,
    backgroundColor: `${colors.river}1F`,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.xs,
    overflow: "hidden",
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
  },
  inviteSheetBody: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: "rgba(230, 236, 245, 0.18)",
  },
  inviteCodeInset: {
    gap: 10,
    overflow: "hidden",
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.42)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  inviteCodeInsetSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.55)",
  },
  inviteCodeEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  inviteShareHint: {
    ...type.display,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.25,
    lineHeight: 22,
    color: colors.ink,
  },
  inviteShareHintMuted: {
    ...type.body,
    fontSize: 14,
    color: colors.inkSoft,
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
    backgroundColor: `${colors.river}1A`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    overflow: "hidden",
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
  },
  copyBtn: {
    backgroundColor: colors.river,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: colors.river,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
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
    color: `${colors.inkSoft}D9`,
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
  inviteMemberCopy: {
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  inviteMemberName: {
    ...type.body,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.15,
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
  emptyDayEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  emptyDayTitle: {
    ...type.display,
    marginTop: 8,
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.35,
    color: colors.ink,
  },
  emptyDayHint: {
    ...type.body,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  emptyDayCta: {
    marginTop: 18,
    alignSelf: "flex-start",
    backgroundColor: colors.river,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.md,
    shadowColor: colors.river,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  emptyDayCtaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  emptyDayCtaText: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
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
