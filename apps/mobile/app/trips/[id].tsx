import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  DemoRoutingEngine,
  formatDuration,
  normalizeStepMode,
  routeAdjacentStops,
  sampleKyotoCollab,
  sampleKyotoFixture,
  searchDemoPlaces,
  stopsForDay,
  summarizeTransfer,
  toPlaceRef,
  type ActivityEvent,
  type BookingLinkKind,
  type Day,
  type Leg,
  type PlaceSummary,
  type Stop,
  type Trip,
  type TripComment,
} from "@beaver/core";
import { colors, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import type { JournalEntry, TripMember, TripRole } from "@beaver/core";
import type { OfflinePinStatus } from "@beaver/offline";
import {
  addTripStop,
  createInvite,
  fetchJournal,
  fetchMembers,
  fetchTrip,
  routeTripDay,
  searchPlaces,
} from "../../src/api";
import { TripMap } from "../../src/components/trip-map";
import {
  flushJournalQueue,
  getPinStatus,
  isDeviceOnline,
  pinTripForOffline,
  readCachedTrip,
  unpinTripOffline,
} from "../../src/offline/trip-offline";

const locale = "zh-CN" as const;
const SEARCH_DEBOUNCE_MS = 220;

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
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [pinStatus, setPinStatus] = useState<OfflinePinStatus | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [routing, setRouting] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);

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
        } else {
          setMembers(m.members);
          setYourRole(m.yourRole);
          setCollabSeeded(false);
        }
      } catch {
        if (tripId === "sample-kyoto") {
          const seed = sampleKyotoCollab();
          setMembers(seed.members);
          setYourRole(seed.yourRole);
          setComments(seed.comments);
          setActivity(seed.events);
          setCollabSeeded(true);
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
        setError(null);
        if (tripId === "sample-kyoto") {
          const seed = sampleKyotoCollab();
          setMembers(seed.members);
          setYourRole(seed.yourRole);
          setComments(seed.comments);
          setActivity(seed.events);
          setCollabSeeded(true);
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

  async function onInvite() {
    try {
      const inv = await createInvite(tripId, "editor");
      setInviteCode(inv.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "invite_failed");
    }
  }

  async function onTogglePin() {
    if (!trip) return;
    setPinBusy(true);
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
      setError(e instanceof Error ? e.message : "pin_failed");
    } finally {
      setPinBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );
  const dayLegs = useMemo(() => {
    const ids = new Set(dayStops.map((s) => s.id));
    return legs.filter((l) => ids.has(l.fromStopId) && ids.has(l.toStopId));
  }, [legs, dayStops]);

  const routeDayStops = useCallback(
    async (activeDayId: string, orderedStops: Stop[]) => {
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
          mode: "transit",
        });
        setLegs((prev) => {
          const ids = new Set(orderedStops.map((s) => s.id));
          const kept = prev.filter(
            (l) => !(ids.has(l.fromStopId) && ids.has(l.toStopId)),
          );
          return [...kept, ...res.legs];
        });
      } catch (e) {
        const routingEngine = new DemoRoutingEngine("google");
        const demoLegs = await routeAdjacentStops(
          routingEngine,
          orderedStops,
          "transit",
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
        setSoftNotice(t(locale, "planner.transfer.demoNotice"));
        setError(null);
        void e;
      } finally {
        setRouting(false);
      }
    },
    [tripId],
  );

  const runSearch = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q) {
        setResults([]);
        return;
      }
      const gen = ++searchGenRef.current;
      setResults(searchDemoPlaces(q));
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
        if (data.places.length > 0) setResults(data.places);
      } catch (e) {
        if (gen !== searchGenRef.current) return;
        if (isNoiseError(e)) {
          setSoftNotice(t(locale, "planner.searchDemo"));
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
    if (q) setResults(searchDemoPlaces(q));
    else setResults([]);
    searchTimerRef.current = setTimeout(() => {
      void runSearch(text);
    }, SEARCH_DEBOUNCE_MS);
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
      setQuery("");
      setResults([]);
      setSearchOpen(false);
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
      setQuery("");
      setResults([]);
      setSearchOpen(false);
      setSelectedStopId(stop.id);
      if (isNoiseError(e)) {
        setSoftNotice(t(locale, "planner.demoLocal"));
        setError(null);
      } else {
        setSoftNotice(t(locale, "planner.demoLocal"));
      }
      await routeDayStops(dayId, stopsForDay(nextStops, dayId));
    }
  }

  const googleKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: trip?.title ?? t(locale, "planner.trip") }} />
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.river} />
        </View>
      )}
      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
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
        >
          <Text style={styles.brandLine}>Beaver Plan · 海狸旅行</Text>
          <Text style={styles.eyebrow}>
            {trip.destination ?? "Beaver Plan"}
            {fromCache ? ` · ${t(locale, "offline.offline")}` : ""}
          </Text>
          <Text style={styles.title}>{trip.title}</Text>
          <Pressable
            style={[
              styles.pinBtn,
              pinStatus?.pinned ? styles.pinBtnActive : null,
            ]}
            disabled={pinBusy}
            onPress={() => void onTogglePin()}
          >
            <Text
              style={[
                styles.pinLabel,
                pinStatus?.pinned ? styles.pinLabelActive : null,
              ]}
            >
              {pinBusy
                ? t(locale, "offline.working")
                : pinStatus?.pinned
                  ? t(locale, "offline.pinned")
                  : t(locale, "offline.pin")}
            </Text>
            <Text style={styles.pinMeta}>
              {(pinStatus?.online ?? isDeviceOnline())
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
          <Text style={styles.pinHint}>{t(locale, "offline.statusHint")}</Text>
          <View style={styles.actionRow}>
            <Pressable
              style={styles.actionBtn}
              onPress={() => router.push(`/trips/${tripId}/journal`)}
            >
              <Text style={styles.actionLabel}>{t(locale, "mobile.journal")}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() => router.push(`/trips/${tripId}/share`)}
            >
              <Text style={[styles.actionLabel, styles.actionPrimaryLabel]}>
                {t(locale, "mobile.share")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionTranslate]}
              onPress={() => router.push("/translate")}
            >
              <Text style={[styles.actionLabel, styles.actionPrimaryLabel]}>
                {t(locale, "mobile.translate")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.collabBox}>
            <Text style={styles.collabEyebrow}>
              {t(locale, "collab.panel.eyebrow")}
            </Text>
            <Text style={styles.collabHeading}>
              {t(locale, "collab.panel.title")}
            </Text>
            <Text style={styles.collabTitle}>{t(locale, "collab.members")}</Text>
            <Text style={styles.collabMeta}>
              {members
                .map((m) => m.displayName ?? m.userId)
                .slice(0, 4)
                .join(" · ") || "—"}
              {yourRole ? ` · ${t(locale, `collab.role.${yourRole}`)}` : ""}
              {collabSeeded ? ` · ${t(locale, "collab.demoBadge")}` : ""}
            </Text>
            {collabSeeded ? (
              <Text style={styles.collabNotice}>
                {softNotice
                  ? t(locale, "collab.panel.softOffline")
                  : t(locale, "collab.panel.demoNotice")}
              </Text>
            ) : null}
            {(yourRole === "owner" || yourRole === "editor") && (
              <Pressable style={styles.inviteBtn} onPress={() => void onInvite()}>
                <Text style={styles.inviteLabel}>{t(locale, "collab.invite")}</Text>
              </Pressable>
            )}
            {inviteCode ? (
              <Text style={styles.inviteCode}>
                {t(locale, "collab.shareHint")} {inviteCode}
              </Text>
            ) : null}
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
                    <Text style={styles.activityType}>
                      {t(locale, `collab.activity.${ev.type}`)}
                    </Text>
                    <Text style={styles.activitySummary}>{ev.summary}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={scheduleSearch}
              onFocus={() => setSearchOpen(true)}
              placeholder={t(locale, "planner.searchPlaceholder")}
              placeholderTextColor={colors.inkSoft}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {searching || routing ? (
              <ActivityIndicator
                style={styles.searchSpinner}
                color={colors.river}
                size="small"
              />
            ) : null}
            {searchOpen && results.length > 0 ? (
              <View style={styles.searchSheet}>
                {results.map((place) => (
                  <Pressable
                    key={place.enginePlaceId}
                    style={styles.searchHit}
                    onPress={() => void addPlace(place)}
                  >
                    <Text style={styles.searchHitName}>{place.name}</Text>
                    {place.address ? (
                      <Text style={styles.searchHitAddr}>{place.address}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {softNotice ? (
            <Text style={styles.softNotice}>{softNotice}</Text>
          ) : null}

          <TripMap
            stops={dayStops}
            legs={dayLegs}
            selectedStopId={selectedStopId}
            onSelectStop={setSelectedStopId}
            googleMapsKey={googleKey}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dayRow}
            contentContainerStyle={styles.dayRowContent}
          >
            {days.map((day, i) => (
              <Pressable
                key={day.id}
                onPress={() => setDayId(day.id)}
                style={[
                  styles.dayChip,
                  dayId === day.id && styles.dayChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.dayChipLabel,
                    dayId === day.id && styles.dayChipLabelActive,
                  ]}
                >
                  {t(locale, "planner.day")} {i + 1}
                </Text>
                <Text
                  style={[
                    styles.dayChipDate,
                    dayId === day.id && styles.dayChipLabelActive,
                  ]}
                >
                  {day.date}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {dayStops.map((stop, index) => {
            const leg = dayLegs.find((l) => l.fromStopId === stop.id);
            const selected = stop.id === selectedStopId;
            return (
              <Pressable
                key={stop.id}
                style={[styles.stopRow, selected && styles.stopRowSelected]}
                onPress={() => setSelectedStopId(stop.id)}
              >
                <View style={[styles.stopIndex, selected && styles.stopIndexSelected]}>
                  <Text style={styles.stopIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.stopBody}>
                  <Text style={styles.stopName}>{stop.place.name}</Text>
                  {stop.place.address ? (
                    <Text style={styles.stopAddr}>{stop.place.address}</Text>
                  ) : null}
                  {leg ? (
                    <View style={styles.legBlock}>
                      <Text style={styles.leg}>→ {summarizeTransfer(leg)}</Text>
                      {leg.transitSteps.length > 1 ? (
                        <View style={styles.stepList}>
                          {leg.transitSteps.map((step, si) => {
                            const kind = normalizeStepMode(step.mode);
                            const label =
                              kind === "transit" && step.lineName
                                ? step.lineName
                                : kind === "walk"
                                  ? t(locale, "planner.transfer.walk")
                                  : kind === "transfer"
                                    ? t(locale, "planner.transfer.change")
                                    : step.instruction || step.mode;
                            return (
                              <Text key={`${leg.id}-m-${si}`} style={styles.stepLine}>
                                {label}
                                {step.durationSec
                                  ? ` · ${formatDuration(step.durationSec)}`
                                  : ""}
                              </Text>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
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
            <Text style={styles.hint}>{t(locale, "planner.emptyDayHint")}</Text>
          )}
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
  content: { padding: 20, paddingBottom: 48 },
  brandLine: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.inkSoft,
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.ink,
    marginBottom: 14,
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
  pinBtnActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  pinLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  pinLabelActive: {
    color: colors.foam,
  },
  pinMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.inkSoft,
  },
  pinHint: {
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
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
    backgroundColor: colors.timber,
    borderColor: colors.timber,
  },
  actionTranslate: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  actionLabel: {
    color: colors.inkSoft,
    fontWeight: "600",
    fontSize: 14,
  },
  actionPrimaryLabel: {
    color: colors.foam,
  },
  collabBox: {
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "transparent",
    gap: 6,
  },
  collabEyebrow: {
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    fontWeight: "700",
    color: colors.river,
  },
  collabHeading: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
    marginBottom: 4,
  },
  collabTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.river,
  },
  collabMeta: { fontSize: 14, color: colors.inkSoft },
  collabNotice: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47,107,255,0.2)",
    backgroundColor: "rgba(47,107,255,0.06)",
    color: colors.riverDeep,
    fontSize: 12,
    lineHeight: 18,
  },
  collabThread: {
    marginTop: 10,
    gap: 8,
  },
  collabSectionLabel: {
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
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  commentBody: {
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
  activityType: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  activitySummary: {
    fontSize: 13,
    color: colors.ink,
  },
  inviteBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.river,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inviteLabel: { color: colors.foam, fontWeight: "600", fontSize: 13 },
  inviteCode: { marginTop: 4, fontSize: 12, color: colors.ink, fontFamily: "monospace" },
  searchWrap: {
    marginBottom: 10,
    zIndex: 5,
  },
  searchInput: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    paddingRight: 40,
  },
  searchSpinner: {
    position: "absolute",
    right: 14,
    top: 14,
  },
  searchSheet: {
    marginTop: 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    overflow: "hidden",
  },
  searchHit: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  searchHitName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  searchHitAddr: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkSoft,
  },
  softNotice: {
    marginBottom: 10,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  dayRow: { marginBottom: 8 },
  dayRowContent: { gap: 0, paddingVertical: 0 },
  dayChip: {
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "transparent",
    marginRight: 4,
  },
  dayChipActive: {
    backgroundColor: colors.river,
    borderBottomColor: colors.riverDeep,
  },
  dayChipLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  dayChipDate: {
    marginTop: 2,
    fontSize: 13,
    color: colors.ink,
    fontWeight: "600",
  },
  dayChipLabelActive: { color: colors.foam },
  stopRow: {
    flexDirection: "row",
    gap: 12,
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
    borderRadius: 8,
    backgroundColor: colors.river,
    alignItems: "center",
    justifyContent: "center",
  },
  stopIndexSelected: {
    backgroundColor: colors.riverDeep,
  },
  stopIndexText: { fontWeight: "800", color: colors.foam, fontSize: 12 },
  stopBody: { flex: 1 },
  stopName: { fontSize: 16, fontWeight: "700", color: colors.ink },
  stopAddr: { marginTop: 3, fontSize: 12, color: colors.inkSoft },
  legBlock: { marginTop: 8, gap: 6 },
  leg: { fontSize: 12, fontWeight: "600", color: colors.river },
  stepList: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(244,246,250,0.95)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    gap: 4,
  },
  stepLine: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 17,
    fontWeight: "500",
  },
  bookingBlock: { marginTop: 8, gap: 6 },
  bookingTitle: {
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
  bookingChipText: { fontSize: 12, color: colors.river, fontWeight: "600" },
  hint: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  error: { color: colors.timber, fontSize: 14 },
  retry: {
    marginTop: 8,
    backgroundColor: colors.timber,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  retryLabel: { color: colors.foam, fontWeight: "600" },
});
