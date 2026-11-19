import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import {
  ActivityIndicator,
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
import { brand, colors } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import {
  createJournalEntry,
  fetchJournal,
  fetchTrip,
  resolveMediaUrl,
  uploadMediaBase64,
} from "../../../src/api";
import {
  enqueueJournalCreate,
  flushJournalQueue,
  isDeviceOnline,
  isOfflineTransportError,
  readCachedTrip,
} from "../../../src/offline/trip-offline";

const locale = "zh-CN" as const;

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

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t(locale, "mobile.journal") }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.river} />
          <Text style={styles.loadingText}>{t(locale, "journal.loading")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>
            {brand.en}
            {fromCache ? ` · ${t(locale, "offline.offline")}` : ""}
          </Text>
          <Text style={styles.brand}>{brand.zh}</Text>
          <Text style={styles.kicker}>{t(locale, "journal.eyebrow")}</Text>
          <Text style={styles.title}>{trip?.title ?? "—"}</Text>
          <Text style={styles.support}>{t(locale, "journal.support")}</Text>

          {demoSeeded ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                {softNotice
                  ? t(locale, "journal.softOffline")
                  : t(locale, "journal.demoNotice")}
              </Text>
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRow}
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
                    styles.dayChipMeta,
                    dayId === day.id && styles.dayChipMetaActive,
                  ]}
                >
                  {t(locale, "journal.daySection").replace("{n}", String(i + 1))}
                </Text>
                <Text
                  style={[
                    styles.dayChipLabel,
                    dayId === day.id && styles.dayChipLabelActive,
                  ]}
                >
                  {day.date}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.daySection}>
            <Text style={styles.daySectionMeta}>
              {t(locale, "journal.daySection").replace(
                "{n}",
                String(activeDayIndex + 1),
              )}
            </Text>
            <Text style={styles.daySectionTitle}>
              {activeDay?.note ?? activeDay?.date ?? trip?.title ?? "—"}
            </Text>
          </View>

          {visible.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <Text style={styles.entryMeta}>
                {stops.find((s) => s.id === entry.stopId)?.place.name ??
                  t(locale, "journal.dayNote")}
                {entry.id.startsWith("local-")
                  ? ` · ${t(locale, "offline.pending").replace("{n}", "1")}`
                  : ""}
              </Text>
              <Text style={styles.entryBody}>{entry.body || "·"}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
          ))}
          {visible.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t(locale, "journal.empty")}</Text>
              <Text style={styles.hint}>{t(locale, "journal.emptyHint")}</Text>
              <View style={styles.slotRow}>
                <View style={styles.slot} />
                <View style={styles.slot} />
                <View style={styles.slot} />
              </View>
            </View>
          )}

          <View style={styles.compose}>
            <Text style={styles.composeTitle}>{t(locale, "journal.compose")}</Text>
            <Text style={styles.composeHint}>{t(locale, "journal.composeHint")}</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={t(locale, "journal.placeholder")}
              placeholderTextColor={colors.inkSoft}
              multiline
              style={styles.input}
            />
            <View style={styles.row}>
              <Pressable style={styles.secondary} onPress={() => void capture()}>
                <Text style={styles.secondaryLabel}>
                  {t(locale, "mobile.capture")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.primary, saving && styles.disabled]}
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
            <Text style={styles.slotsLabel}>{t(locale, "journal.photoSlots")}</Text>
            <ScrollView horizontal style={{ marginTop: 8 }}>
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
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: colors.inkSoft, fontSize: 14 },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "600",
  },
  brand: {
    marginTop: 8,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.ink,
  },
  kicker: {
    marginTop: 14,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.inkSoft,
    fontWeight: "600",
  },
  title: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: "700",
    color: colors.ink,
  },
  support: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  notice: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47, 107, 255, 0.2)",
    backgroundColor: "rgba(47, 107, 255, 0.06)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeText: {
    color: colors.riverDeep,
    fontSize: 13,
    lineHeight: 18,
  },
  dayRow: { gap: 8, paddingVertical: 16 },
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
    backgroundColor: colors.river,
    borderColor: colors.river,
  },
  dayChipMeta: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSoft,
    marginBottom: 2,
  },
  dayChipMetaActive: { color: "rgba(255,255,255,0.8)" },
  dayChipLabel: { fontSize: 13, fontWeight: "600", color: colors.inkSoft },
  dayChipLabelActive: { color: colors.foam },
  daySection: {
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    marginBottom: 8,
  },
  daySectionMeta: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "600",
  },
  daySectionTitle: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
  },
  entry: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  entryMeta: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "600",
    marginBottom: 8,
  },
  entryBody: {
    fontSize: 22,
    lineHeight: 30,
    color: colors.ink,
    marginBottom: 12,
    fontWeight: "600",
  },
  thumb: {
    width: 72,
    height: 96,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: colors.mist,
  },
  slot: {
    width: 72,
    height: 96,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(47, 107, 255, 0.3)",
    backgroundColor: "rgba(47, 107, 255, 0.06)",
  },
  slotRow: { flexDirection: "row", marginTop: 14 },
  empty: {
    marginTop: 8,
    paddingVertical: 18,
    paddingHorizontal: 4,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  hint: { color: colors.inkSoft, fontSize: 14, marginTop: 8, lineHeight: 20 },
  compose: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.foam,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  composeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  composeHint: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    color: colors.inkSoft,
  },
  input: {
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.paper,
    textAlignVertical: "top",
  },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  primary: {
    flex: 1,
    backgroundColor: colors.river,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryLabel: { color: colors.foam, fontWeight: "600" },
  secondary: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.paper,
  },
  secondaryLabel: { color: colors.river, fontWeight: "600" },
  slotsLabel: {
    marginTop: 14,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.inkSoft,
    fontWeight: "600",
  },
  disabled: { opacity: 0.45 },
  error: { marginTop: 10, color: colors.timber, fontSize: 13 },
  info: { marginTop: 10, color: colors.river, fontSize: 13 },
});
