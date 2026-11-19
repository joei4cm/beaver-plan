import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, Stack, Link } from "expo-router";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  decodeSimplePolyline,
  encodeRoadPolyline,
  formatDuration,
  legPathSegments,
  normalizeStepMode,
  stopsForDay,
  summarizeTransfer,
  type BookingLinkKind,
  type Day,
  type Leg,
  type Stop,
  type Trip,
} from "@beaver/core";
import { colors, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import type { JournalEntry, TripMember, TripRole } from "@beaver/core";
import type { OfflinePinStatus } from "@beaver/offline";
import { createInvite, fetchJournal, fetchMembers, fetchTrip } from "../../src/api";
import {
  flushJournalQueue,
  getPinStatus,
  isDeviceOnline,
  pinTripForOffline,
  readCachedTrip,
  unpinTripOffline,
} from "../../src/offline/trip-offline";

const locale = "zh-CN" as const;

function MiniMap({ stops, legs }: { stops: Stop[]; legs: Leg[] }) {
  const routePts: { lat: number; lng: number; mode: string }[] = [];
  for (const leg of legs) {
    const segs = legPathSegments(leg);
    let added = false;
    for (const seg of segs) {
      if (!seg.polyline?.includes(";")) continue;
      const pts = decodeSimplePolyline(seg.polyline);
      if (pts.length < 2) continue;
      for (const p of pts) routePts.push({ ...p, mode: seg.mode });
      added = true;
    }
    if (added) continue;
    const from = stops.find((s) => s.id === leg.fromStopId);
    const to = stops.find((s) => s.id === leg.toStopId);
    if (!from || !to) continue;
    const mode =
      leg.mode === "walk" ? "walk" : leg.mode === "drive" ? "drive" : "transit";
    const poly = encodeRoadPolyline(
      { lat: from.place.lat, lng: from.place.lng },
      { lat: to.place.lat, lng: to.place.lng },
      { mode },
    );
    for (const p of decodeSimplePolyline(poly)) {
      routePts.push({ ...p, mode });
    }
  }

  const points = stops.map((s) => ({ lat: s.place.lat, lng: s.place.lng }));
  const all = [...points, ...routePts];
  const minLat = Math.min(...all.map((p) => p.lat), 34.9);
  const maxLat = Math.max(...all.map((p) => p.lat), 35.1);
  const minLng = Math.min(...all.map((p) => p.lng), 135.6);
  const maxLng = Math.max(...all.map((p) => p.lng), 135.85);
  const W = 100;
  const H = 100;
  const proj = (lat: number, lng: number) => ({
    left: ((lng - minLng) / (maxLng - minLng || 1)) * W,
    top: (1 - (lat - minLat) / (maxLat - minLat || 1)) * H,
  });

  return (
    <View style={styles.map}>
      <View style={styles.mapWash} pointerEvents="none" />
      {routePts.map((p, i) => {
        // Sample every other vertex so the strip stays light.
        if (i % 2 === 1) return null;
        const pos = proj(p.lat, p.lng);
        const color =
          p.mode === "walk"
            ? "#64748B"
            : p.mode === "transfer"
              ? colors.timber
              : colors.river;
        return (
          <View
            key={`dot-${i}`}
            style={[
              styles.routeDot,
              {
                left: `${pos.left}%`,
                top: `${pos.top}%`,
                backgroundColor: color,
              },
            ]}
          />
        );
      })}
      {stops.map((stop, i) => {
        const p = proj(stop.place.lat, stop.place.lng);
        return (
          <View
            key={stop.id}
            style={[
              styles.marker,
              {
                left: `${p.left}%`,
                top: `${p.top}%`,
                marginLeft: -11,
                marginTop: -11,
              },
            ]}
          >
            <Text style={styles.markerText}>{i + 1}</Text>
          </View>
        );
      })}
      <Text style={styles.mapHint}>{t(locale, "mobile.itinerary")}</Text>
    </View>
  );
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = typeof id === "string" ? id : "sample-kyoto";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [yourRole, setYourRole] = useState<TripRole | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [pinStatus, setPinStatus] = useState<OfflinePinStatus | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [fromCache, setFromCache] = useState(false);

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
        setMembers(m.members);
        setYourRole(m.yourRole);
      } catch {
        /* members optional if offline */
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
        await refreshPin();
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

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );
  const dayLegs = useMemo(() => {
    const ids = new Set(dayStops.map((s) => s.id));
    return legs.filter((l) => ids.has(l.fromStopId) && ids.has(l.toStopId));
  }, [legs, dayStops]);

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
        <ScrollView contentContainerStyle={styles.content}>
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
            <Link href={`/trips/${tripId}/journal`} asChild>
              <Pressable style={styles.actionBtn}>
                <Text style={styles.actionLabel}>{t(locale, "mobile.journal")}</Text>
              </Pressable>
            </Link>
            <Link href={`/trips/${tripId}/share`} asChild>
              <Pressable style={[styles.actionBtn, styles.actionPrimary]}>
                <Text style={[styles.actionLabel, styles.actionPrimaryLabel]}>
                  {t(locale, "mobile.share")}
                </Text>
              </Pressable>
            </Link>
            <Link href="/translate" asChild>
              <Pressable style={[styles.actionBtn, styles.actionTranslate]}>
                <Text style={[styles.actionLabel, styles.actionPrimaryLabel]}>
                  {t(locale, "mobile.translate")}
                </Text>
              </Pressable>
            </Link>
          </View>

          <View style={styles.collabBox}>
            <Text style={styles.collabTitle}>{t(locale, "collab.members")}</Text>
            <Text style={styles.collabMeta}>
              {members
                .map((m) => m.displayName ?? m.userId)
                .slice(0, 4)
                .join(" · ") || "—"}
              {yourRole ? ` · ${t(locale, `collab.role.${yourRole}`)}` : ""}
            </Text>
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
          </View>
          <MiniMap stops={dayStops} legs={dayLegs} />

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
            return (
              <View key={stop.id} style={styles.stopRow}>
                <View style={styles.stopIndex}>
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
              </View>
            );
          })}
          {dayStops.length === 0 && (
            <Text style={styles.hint}>{t(locale, "planner.emptyDay")}</Text>
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
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    gap: 6,
  },
  collabTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.river,
  },
  collabMeta: { fontSize: 14, color: colors.inkSoft },
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
  map: {
    height: 240,
    borderRadius: radius.lg,
    backgroundColor: "#EAF0F8",
    overflow: "hidden",
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  mapWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#DBE8FF",
    opacity: 0.35,
  },
  routeDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    marginLeft: -2.5,
    marginTop: -2.5,
  },
  mapHint: {
    position: "absolute",
    left: 12,
    top: 12,
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  marker: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.foam,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.river,
    zIndex: 2,
  },
  markerText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.ink,
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
  stopIndex: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.river,
    alignItems: "center",
    justifyContent: "center",
  },
  stopIndexText: { fontWeight: "800", color: colors.foam, fontSize: 12 },
  stopBody: { flex: 1 },
  stopName: { fontSize: 16, fontWeight: "700", color: colors.ink },
  stopAddr: { marginTop: 3, fontSize: 12, color: colors.inkSoft },
  legBlock: { marginTop: 6, gap: 4 },
  leg: { fontSize: 12, fontWeight: "600", color: colors.river },
  stepList: {
    marginTop: 2,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: colors.mist,
    gap: 2,
  },
  stepLine: { fontSize: 11, color: colors.inkSoft, lineHeight: 16 },
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
    borderColor: "rgba(12,124,120,0.35)",
    backgroundColor: "rgba(12,124,120,0.08)",
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
