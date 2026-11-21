import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  journalForDay,
  sampleKyotoFixture,
  sampleKyotoJournal,
  stopsForDay,
  type Day,
  type JournalEntry,
  type Stop,
  type Trip,
} from "@beaver/core";
import { brand, colors, motion, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import {
  createJournalEntry,
  fetchJournal,
  fetchTrip,
  resolveMediaUrl,
  uploadMediaBase64,
} from "../../../src/api";
import { SoftFailNotice } from "../../../src/components/soft-fail-notice";
import {
  enqueueJournalCreate,
  flushJournalQueue,
  isDeviceOnline,
  isOfflineTransportError,
  readCachedTrip,
} from "../../../src/offline/trip-offline";
import { type } from "../../../src/theme";

const locale = "zh-CN" as const;
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

type LocalPhoto = {
  id: string;
  contentType: string;
  dataBase64: string;
  preview: string;
};

function isNoiseError(err: unknown): boolean {
  if (isOfflineTransportError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b503\b/.test(msg) ||
    /Failed to fetch/i.test(msg) ||
    /database_required|DATABASE_URL|Neon/i.test(msg) ||
    /ECONNREFUSED|NetworkError|Load failed/i.test(msg)
  );
}

/** Editorial index mark — web #80 EntryIndexMark parity. */
function EntryIndexMark({ n }: { n: number }) {
  return (
    <Text style={styles.indexMark} accessibilityElementsHidden>
      {String(n).padStart(2, "0")}
    </Text>
  );
}

export default function JournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = typeof id === "string" ? id : "sample-kyoto";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [pendingMedia, setPendingMedia] = useState<string[]>([]);
  const [pendingLocal, setPendingLocal] = useState<LocalPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [demoSeeded, setDemoSeeded] = useState(false);
  const [softNotice, setSoftNotice] = useState(false);
  const composeRef = useRef<TextInput | null>(null);
  const rise = useRef(new Animated.Value(0)).current;

  const applySampleSeed = useCallback(
    (opts?: { soft?: boolean }) => {
      if (tripId !== "sample-kyoto") return false;
      const fixture = sampleKyotoFixture();
      setTrip(fixture.trip);
      setDays(fixture.days);
      setStops(fixture.stops);
      setEntries(fixture.journal);
      setDayId((prev) => prev ?? fixture.days[0]?.id ?? null);
      setDemoSeeded(true);
      setSoftNotice(Boolean(opts?.soft));
      setFromCache(false);
      setError(null);
      return true;
    },
    [tripId],
  );

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
      const [tripData, journal] = await Promise.all([
        fetchTrip(tripId),
        fetchJournal(tripId),
      ]);
      setTrip(tripData.trip);
      setDays(tripData.days);
      setStops(tripData.stops);
      const next =
        tripId === "sample-kyoto" &&
        (!journal.entries || journal.entries.length === 0)
          ? sampleKyotoJournal()
          : journal.entries;
      setEntries(next);
      setDemoSeeded(
        tripId === "sample-kyoto" &&
          (!journal.entries || journal.entries.length === 0),
      );
      setSoftNotice(false);
      setDayId((prev) => prev ?? tripData.days[0]?.id ?? null);
      setFromCache(false);
      setInfo(null);
    } catch (e) {
      const cached = await readCachedTrip(tripId);
      if (cached) {
        setTrip(cached.trip);
        setDays(cached.days);
        setStops(cached.stops);
        setEntries(
          cached.journal.length > 0
            ? cached.journal
            : tripId === "sample-kyoto"
              ? sampleKyotoJournal()
              : [],
        );
        setDayId((prev) => prev ?? cached.days[0]?.id ?? null);
        setFromCache(true);
        setDemoSeeded(
          tripId === "sample-kyoto" && cached.journal.length === 0,
        );
        setSoftNotice(isNoiseError(e));
        setInfo(t(locale, "offline.cachedRead"));
      } else if (!applySampleSeed({ soft: true })) {
        setError(e instanceof Error ? e.message : "load_failed");
      }
    } finally {
      setLoading(false);
    }
  }, [applySampleSeed, tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [loading, rise, dayId]);

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );
  const visible = useMemo(() => {
    if (!dayId) return entries;
    return journalForDay(
      entries,
      dayId,
      dayStops.map((s) => s.id),
    );
  }, [entries, dayId, dayStops]);

  const activeDay = useMemo(
    () => days.find((d) => d.id === dayId) ?? null,
    [days, dayId],
  );
  const activeDayIndex = useMemo(() => {
    if (!dayId) return 0;
    const idx = days.findIndex((d) => d.id === dayId);
    return idx >= 0 ? idx : 0;
  }, [days, dayId]);

  const riseStyle = {
    opacity: rise,
    transform: [
      {
        translateY: rise.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

  async function capture() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("permission_denied");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (picked.canceled) return;
    try {
      if (!isDeviceOnline()) {
        const locals: LocalPhoto[] = [];
        for (const asset of picked.assets.slice(0, 4)) {
          const b64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const contentType = asset.mimeType ?? "image/jpeg";
          locals.push({
            id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            contentType,
            dataBase64: b64,
            preview: `data:${contentType};base64,${b64}`,
          });
        }
        setPendingLocal((prev) => [...prev, ...locals].slice(0, 8));
        return;
      }
      const urls: string[] = [];
      for (const asset of picked.assets.slice(0, 4)) {
        const b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const uploaded = await uploadMediaBase64({
          tripId,
          contentType: asset.mimeType ?? "image/jpeg",
          dataBase64: b64,
        });
        urls.push(uploaded.key ?? uploaded.url);
      }
      setPendingMedia((prev) => [...prev, ...urls].slice(0, 8));
    } catch (e) {
      if (isOfflineTransportError(e) || isNoiseError(e)) {
        try {
          const locals: LocalPhoto[] = [];
          for (const asset of picked.assets.slice(0, 4)) {
            const b64 = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const contentType = asset.mimeType ?? "image/jpeg";
            locals.push({
              id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              contentType,
              dataBase64: b64,
              preview: `data:${contentType};base64,${b64}`,
            });
          }
          setPendingLocal((prev) => [...prev, ...locals].slice(0, 8));
          setInfo(t(locale, "offline.savedLocal"));
          return;
        } catch {
          /* fall through */
        }
      }
      setError(e instanceof Error ? e.message : "upload_failed");
    }
  }

  async function save() {
    if (!body.trim() && pendingMedia.length === 0 && pendingLocal.length === 0) {
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);

    const finishLocal = async () => {
      const queued = await enqueueJournalCreate({
        tripId,
        body: body.trim(),
        dayId: dayId ?? undefined,
        mediaKeys: pendingMedia,
        pendingPhotos: pendingLocal.map((p) => ({
          id: p.id,
          contentType: p.contentType,
          dataBase64: p.dataBase64,
        })),
        expectedVersion: trip?.version,
      });
      setEntries((prev) => [...prev, queued.localEntry]);
      setBody("");
      setPendingMedia([]);
      setPendingLocal([]);
      setInfo(t(locale, "offline.savedLocal"));
    };

    try {
      if (!isDeviceOnline() || softNotice) {
        await finishLocal();
        return;
      }
      await createJournalEntry(tripId, {
        dayId: dayId ?? undefined,
        body: body.trim(),
        media: pendingMedia,
        expectedVersion: trip?.version,
      });
      setBody("");
      setPendingMedia([]);
      setPendingLocal([]);
      const journal = await fetchJournal(tripId);
      setEntries(
        journal.entries.length > 0 ? journal.entries : sampleKyotoJournal(),
      );
    } catch (e) {
      if (isOfflineTransportError(e) || isNoiseError(e)) {
        await finishLocal();
        return;
      }
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  }

  const previewMedia = [
    ...pendingMedia.map((url) => ({ key: url, uri: resolveMediaUrl(url) })),
    ...pendingLocal.map((p) => ({ key: p.id, uri: p.preview })),
  ];
  const emptySlots = Math.max(0, 3 - previewMedia.length);
  const showSoftFail = demoSeeded || softNotice;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t(locale, "mobile.journal") }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.river} />
          <Text style={styles.loadingText}>{t(locale, "journal.loading")}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Animated.View keeps style arrays — flatten breaks animated nodes on RN Web. */}
          <Animated.View style={[styles.hero, riseStyle]}>
            <Text style={styles.eyebrow}>
              {brand.en}
              {fromCache ? ` · ${t(locale, "offline.offline")}` : ""}
            </Text>
            <Text style={styles.brand}>{brand.zh}</Text>
            <Text style={styles.kicker}>{t(locale, "journal.eyebrow")}</Text>
            <Text style={styles.title}>{trip?.title ?? "—"}</Text>
            <Text style={styles.support}>{t(locale, "journal.support")}</Text>
          </Animated.View>

          <Animated.View style={[styles.sheet, riseStyle]}>
            {/* Day tabs — tip 015 mist rail + river active (web #80 / planner #66). */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.dayRail}
              contentContainerStyle={styles.dayRailContent}
              accessibilityRole="tablist"
              accessibilityLabel={t(locale, "journal.eyebrow")}
            >
              {days.map((day, i) => {
                const active = dayId === day.id;
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => setDayId(day.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={StyleSheet.flatten([
                      styles.dayChip,
                      active ? styles.dayChipActive : null,
                    ])}
                  >
                    <Text
                      style={StyleSheet.flatten([
                        styles.dayChipMeta,
                        active ? styles.dayChipMetaActive : null,
                      ])}
                    >
                      {t(locale, "journal.daySection").replace(
                        "{n}",
                        String(i + 1),
                      )}
                    </Text>
                    <Text
                      style={StyleSheet.flatten([
                        styles.dayChipLabel,
                        active ? styles.dayChipLabelActive : null,
                      ])}
                    >
                      {day.date}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.listPane}>
              <View style={styles.listHead}>
                <Text style={styles.listEyebrow}>
                  {t(locale, "journal.listEyebrow")}
                  {" · "}
                  {t(locale, "journal.daySection").replace(
                    "{n}",
                    String(activeDayIndex + 1),
                  )}
                </Text>
                <Text style={styles.daySectionTitle}>
                  {activeDay?.note ?? activeDay?.date ?? trip?.title ?? "—"}
                </Text>
                <Text style={styles.entryCount}>
                  {activeDay?.date ? `${activeDay.date} · ` : ""}
                  {t(locale, "journal.entryCount").replace(
                    "{n}",
                    String(visible.length),
                  )}
                </Text>
              </View>

              {showSoftFail ? (
                <SoftFailNotice style={styles.softFail}>
                  {softNotice
                    ? t(locale, "journal.softOffline")
                    : t(locale, "journal.demoNotice")}
                </SoftFailNotice>
              ) : null}

              {visible.map((entry, index) => {
                const stop = stops.find((s) => s.id === entry.stopId);
                const isLast = index === visible.length - 1;
                return (
                  <View
                    key={entry.id}
                    style={StyleSheet.flatten([
                      styles.entry,
                      isLast ? styles.entryLast : null,
                    ])}
                  >
                    <EntryIndexMark n={index + 1} />
                    <View style={styles.entryBodyCol}>
                      <Text style={styles.entryMeta}>
                        {stop?.place.name ??
                          days.find((d) => d.id === entry.dayId)?.note ??
                          t(locale, "journal.dayNote")}
                        {entry.id.startsWith("local-")
                          ? ` · ${t(locale, "offline.pending").replace("{n}", "1")}`
                          : ""}
                      </Text>
                      <Text style={styles.entryBody}>
                        {entry.body || "·"}
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        {entry.media.map((url) => (
                          <Image
                            key={url}
                            source={{ uri: resolveMediaUrl(url) }}
                            style={styles.thumb}
                          />
                        ))}
                        {entry.media.length === 0 ? (
                          <>
                            <View style={styles.slot} />
                            <View style={styles.slot} />
                          </>
                        ) : null}
                      </ScrollView>
                    </View>
                  </View>
                );
              })}

              {visible.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>
                    {t(locale, "journal.empty")}
                  </Text>
                  <Text style={styles.hint}>
                    {t(locale, "journal.emptyHint")}
                  </Text>
                  <Pressable
                    style={styles.emptyCta}
                    onPress={() => composeRef.current?.focus()}
                  >
                    <Text style={styles.emptyCtaText}>
                      {t(locale, "journal.emptyCta")}
                    </Text>
                  </Pressable>
                  <View style={styles.slotRow}>
                    <View style={styles.slot} />
                    <View style={styles.slot} />
                    <View style={styles.slot} />
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.compose}>
              <Text style={styles.composeTitle}>
                {t(locale, "journal.compose")}
              </Text>
              <Text style={styles.composeHint}>
                {t(locale, "journal.composeHint")}
              </Text>
              <TextInput
                ref={composeRef}
                value={body}
                onChangeText={setBody}
                placeholder={t(locale, "journal.placeholder")}
                placeholderTextColor={colors.inkSoft}
                multiline
                style={styles.input}
              />
              <View style={styles.row}>
                <Pressable
                  style={styles.secondary}
                  onPress={() => void capture()}
                >
                  <Text style={styles.secondaryLabel}>
                    {t(locale, "mobile.capture")}
                  </Text>
                </Pressable>
                <Pressable
                  style={StyleSheet.flatten([
                    styles.primary,
                    saving ? styles.disabled : null,
                  ])}
                  disabled={saving}
                  onPress={() => void save()}
                >
                  <Text style={styles.primaryLabel}>
                    {saving
                      ? t(locale, "journal.saving")
                      : t(locale, "journal.save")}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.slotsLabel}>
                {t(locale, "journal.photoSlots")}
              </Text>
              <ScrollView horizontal style={styles.previewRow}>
                {previewMedia.map((item) => (
                  <Image
                    key={item.key}
                    source={{ uri: item.uri }}
                    style={styles.thumb}
                  />
                ))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <View key={`slot-${i}`} style={styles.slot} />
                ))}
              </ScrollView>
              {info ? <Text style={styles.info}>{info}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 14,
  },
  content: { padding: 20, paddingBottom: 48 },
  hero: {
    marginBottom: 16,
  },
  eyebrow: {
    ...type.body,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
  },
  brand: {
    ...type.display,
    marginTop: 8,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.ink,
  },
  kicker: {
    ...type.body,
    marginTop: 14,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.inkSoft,
    fontWeight: "600",
  },
  title: {
    ...type.display,
    marginTop: 6,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  support: {
    ...type.body,
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
    maxWidth: 360,
  },
  sheet: {
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
  },
  dayRail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
  },
  dayRailContent: {
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: "transparent",
  },
  dayChipActive: {
    backgroundColor: colors.river,
  },
  dayChipMeta: {
    ...type.body,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSoft,
    fontWeight: "700",
    marginBottom: 2,
  },
  dayChipMetaActive: { color: "rgba(255,255,255,0.85)" },
  dayChipLabel: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  dayChipLabelActive: { color: colors.foam },
  listPane: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 8,
  },
  listHead: {
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    marginBottom: 4,
  },
  listEyebrow: {
    ...type.body,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
  },
  daySectionTitle: {
    ...type.display,
    marginTop: 8,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  entryCount: {
    ...type.body,
    marginTop: 8,
    fontSize: 13,
    color: colors.inkSoft,
  },
  softFail: {
    marginTop: 14,
    marginBottom: 4,
  },
  entry: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  entryLast: {
    borderBottomWidth: 0,
  },
  indexMark: {
    ...type.display,
    width: 36,
    fontSize: 26,
    fontWeight: "700",
    color: colors.mist,
    lineHeight: 30,
  },
  entryBodyCol: {
    flex: 1,
    minWidth: 0,
  },
  entryMeta: {
    ...type.body,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
    marginBottom: 8,
  },
  entryBody: {
    ...type.display,
    fontSize: 22,
    lineHeight: 30,
    color: colors.ink,
    marginBottom: 12,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  thumb: {
    width: 72,
    height: 96,
    marginRight: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.mist,
  },
  slot: {
    width: 72,
    height: 96,
    marginRight: 8,
    borderRadius: radius.sm,
    backgroundColor: "rgba(47, 107, 255, 0.1)",
  },
  slotRow: { flexDirection: "row", marginTop: 16 },
  empty: {
    marginTop: 8,
    paddingVertical: 18,
    paddingHorizontal: 4,
    maxWidth: 360,
  },
  emptyTitle: {
    ...type.display,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  hint: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 14,
    marginTop: 8,
    lineHeight: 21,
  },
  emptyCta: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: colors.river,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
  emptyCtaText: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
  },
  compose: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.45)",
  },
  composeTitle: {
    ...type.display,
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  composeHint: {
    ...type.body,
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    color: colors.inkSoft,
  },
  input: {
    ...type.body,
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.foam,
    textAlignVertical: "top",
  },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  primary: {
    flex: 1,
    backgroundColor: colors.river,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryLabel: {
    ...type.body,
    color: colors.foam,
    fontWeight: "700",
  },
  secondary: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.foam,
  },
  secondaryLabel: {
    ...type.body,
    color: colors.river,
    fontWeight: "700",
  },
  slotsLabel: {
    ...type.body,
    marginTop: 14,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.inkSoft,
    fontWeight: "600",
  },
  previewRow: { marginTop: 8 },
  disabled: { opacity: 0.45 },
  error: {
    ...type.body,
    marginTop: 10,
    color: colors.timber,
    fontSize: 13,
  },
  info: {
    ...type.body,
    marginTop: 10,
    color: colors.river,
    fontSize: 13,
  },
});
