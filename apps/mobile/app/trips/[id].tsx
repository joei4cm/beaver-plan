import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, Stack, Link } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  decodeSimplePolyline,
  formatDistance,
  formatDuration,
  stopsForDay,
  type Day,
  type Leg,
  type Stop,
  type Trip,
} from "@beaver/core";
import { colors } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import type { TripMember, TripRole } from "@beaver/core";
import { createInvite, fetchMembers, fetchTrip } from "../../src/api";

const locale = "zh-CN" as const;

function MiniMap({ stops, legs }: { stops: Stop[]; legs: Leg[] }) {
  const points = stops.map((s) => ({ lat: s.place.lat, lng: s.place.lng }));
  const all = [...points];
  for (const leg of legs) {
    if (leg.polyline?.includes(";")) {
      all.push(...decodeSimplePolyline(leg.polyline));
    }
  }
  const minLat = Math.min(...all.map((p) => p.lat), 34.9);
  const maxLat = Math.max(...all.map((p) => p.lat), 35.1);
  const minLng = Math.min(...all.map((p) => p.lng), 135.6);
  const maxLng = Math.max(...all.map((p) => p.lng), 135.85);
  const W = 100;
  const H = 100;
  const proj = (lat: number, lng: number) => ({
    left: `${((lng - minLng) / (maxLng - minLng || 1)) * W}%` as const,
    top: `${(1 - (lat - minLat) / (maxLat - minLat || 1)) * H}%` as const,
  });

  return (
    <View style={styles.map}>
      {stops.map((stop, i) => {
        const p = proj(stop.place.lat, stop.place.lng);
        return (
          <View
            key={stop.id}
            style={[
              styles.marker,
              { left: p.left, top: p.top, marginLeft: -11, marginTop: -11 },
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTrip(tripId);
      setTrip(data.trip);
      setDays(data.days);
      setStops(data.stops);
      setLegs(data.legs);
      setDayId(data.days[0]?.id ?? null);
      setMembers(data.members ?? []);
      setYourRole(data.yourRole ?? null);
      try {
        const m = await fetchMembers(tripId);
        setMembers(m.members);
        setYourRole(m.yourRole);
      } catch {
        /* members optional if offline */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  async function onInvite() {
    try {
      const inv = await createInvite(tripId, "editor");
      setInviteCode(inv.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "invite_failed");
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
          <Text style={styles.eyebrow}>{trip.destination ?? "Beaver Plan"}</Text>
          <Text style={styles.title}>{trip.title}</Text>
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
                    <Text style={styles.leg}>
                      → {formatDuration(leg.durationSec)} ·{" "}
                      {formatDistance(leg.distanceM)} · {leg.mode}
                    </Text>
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
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionPrimary: {
    backgroundColor: colors.river,
    borderColor: colors.river,
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
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.riverDeep,
    overflow: "hidden",
    marginBottom: 18,
  },
  mapHint: {
    position: "absolute",
    left: 12,
    top: 12,
    color: "rgba(247,250,248,0.75)",
    fontSize: 11,
    letterSpacing: 1,
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
  },
  markerText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.riverDeep,
  },
  dayRow: { marginBottom: 8 },
  dayRowContent: { gap: 8, paddingVertical: 4 },
  dayChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.foam,
    marginRight: 8,
  },
  dayChipActive: {
    backgroundColor: colors.riverDeep,
    borderColor: colors.riverDeep,
  },
  dayChipLabel: {
    fontSize: 11,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  dayChipDate: { marginTop: 2, fontSize: 13, color: colors.ink, fontWeight: "500" },
  dayChipLabelActive: { color: colors.foam },
  stopRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  stopIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(31,107,92,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  stopIndexText: { fontWeight: "700", color: colors.riverDeep, fontSize: 12 },
  stopBody: { flex: 1 },
  stopName: { fontSize: 16, fontWeight: "500", color: colors.ink },
  stopAddr: { marginTop: 3, fontSize: 12, color: colors.inkSoft },
  leg: { marginTop: 6, fontSize: 12, color: colors.river },
  hint: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  error: { color: colors.timber, fontSize: 14 },
  retry: {
    marginTop: 8,
    backgroundColor: colors.river,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryLabel: { color: colors.foam, fontWeight: "600" },
});
