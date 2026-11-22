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
import {
  SoftFailBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashStyle,
} from "../../../src/components/soft-fail-notice";
import { SheetPresence } from "../../../src/components/sheet-presence";
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
/** Photo strip slots — web #134 / #124 Polarsteps-like. */
const PHOTO_SLOT_MAX = 3;

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

/** Editorial index mark — mist by default; river when stop-linked (#134 / tip-011). */
function EntryIndexMark({ n, active }: { n: number; active?: boolean }) {
  return (
    <View
      style={StyleSheet.flatten([
        styles.indexMark,
        active ? styles.indexMarkActive : null,
      ])}
      accessibilityElementsHidden
    >
      <Text
        style={StyleSheet.flatten([
          styles.indexMarkText,
          active ? styles.indexMarkTextActive : null,
        ])}
      >
        {String(n).padStart(2, "0")}
      </Text>
    </View>
  );
}

/** Craft SoftFail query parity with web (`?composeSoftFail=1` / `?entriesSoftFail=1`). */
function craftSoftFailOn(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1";
}

export default function JournalScreen() {
  const {
    id,
    composeSoftFail: composeSoftFailParam,
    entriesSoftFail: entriesSoftFailParam,
  } = useLocalSearchParams<{
    id: string;
    composeSoftFail?: string | string[];
    entriesSoftFail?: string | string[];
  }>();
  const tripId = typeof id === "string" ? id : "sample-kyoto";
  /** Craft preview: /trips/…/journal?composeSoftFail=1 — SoftFail depth under Compose. */
  const composeSoftPreview = craftSoftFailOn(composeSoftFailParam);
  /** Craft preview: /trips/…/journal?entriesSoftFail=1 — SoftFail depth under Soft entries. */
  const entriesSoftPreview = craftSoftFailOn(entriesSoftFailParam);
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
  /** Media / journal API soft-fail while composing (R2 / Neon absent) — web #110. */
  const [composeSoftFail, setComposeSoftFail] = useState(false);
  const [stopId, setStopId] = useState<string>("");
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
      setComposeSoftFail(true);
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
      setComposeSoftFail(
        tripId === "sample-kyoto" &&
          (!journal.entries || journal.entries.length === 0),
      );
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
        setComposeSoftFail(true);
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

  /** Clear stop bind when switching days — web #110 compose settle. */
  useEffect(() => {
    setStopId("");
  }, [dayId]);

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
        setComposeSoftFail(true);
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
          setComposeSoftFail(true);
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
        stopId: stopId || undefined,
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
      setComposeSoftFail(true);
      setInfo(t(locale, "offline.savedLocal"));
    };

    try {
      if (!isDeviceOnline() || softNotice) {
        await finishLocal();
        return;
      }
      await createJournalEntry(tripId, {
        dayId: dayId ?? undefined,
        stopId: stopId || undefined,
        body: body.trim(),
        media: pendingMedia,
        expectedVersion: trip?.version,
      });
      setBody("");
      setPendingMedia([]);
      setPendingLocal([]);
      setComposeSoftFail(false);
      const journal = await fetchJournal(tripId);
      setEntries(
        journal.entries.length > 0 ? journal.entries : sampleKyotoJournal(),
      );
    } catch (e) {
      if (isOfflineTransportError(e) || isNoiseError(e)) {
        setComposeSoftFail(true);
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
  const emptySlots = Math.max(0, PHOTO_SLOT_MAX - previewMedia.length);
  /**
   * Entry SoftFail helpers (BEA-391 after #284 / BEA-370) + craft SoftFail
   * query parity (BEA-424): azure Entries rail · SoftFailBadge Soft entries ·
   * SoftFailSupport · compact SoftFail mist band (`border-b`) · tip-011
   * mist-wash SheetPresence · StyleSheet.flatten. Craft:
   * /trips/…/journal?entriesSoftFail=1 — SoftFail depth without API down.
   * SoftFail copy always softFail / softOffline — never timber / Failed to
   * fetch. Yields while empty SoftFail (#231) would own the Entries rail (no
   * double depth). Compose SoftFail (#247) keeps its own Compose rail —
   * different azure rail. SoftFail depth + helpers kept. No `/dev` SoftFail
   * gallery.
   */
  const entryEmpty = visible.length === 0;
  const emptyOwnsSoft = entryEmpty;
  const entryOwnsSoft =
    (entriesSoftPreview || demoSeeded || softNotice) && !emptyOwnsSoft;
  const showListSoftFail = entryOwnsSoft;
  const listSoftCopy = entriesSoftPreview
    ? t(locale, "journal.softFail")
    : softNotice && !isDeviceOnline()
      ? t(locale, "journal.softOffline")
      : t(locale, "journal.softFail");
  const listSoftSupportCopy = t(locale, "journal.softSupport");
  /**
   * Compose SoftFail helpers (BEA-391 after #284 / BEA-322) + craft SoftFail
   * query parity (BEA-424): azure Compose rail · SoftFailBadge Soft media ·
   * SoftFailSupport · compact SoftFail mist band (`border-b`) · tip-011
   * mist-wash SheetPresence · StyleSheet.flatten. Craft:
   * /trips/…/journal?composeSoftFail=1 — SoftFail depth without a media miss.
   * SoftFail copy always composeSoftFail — never timber / Failed to fetch.
   */
  const composeOwnsSoft = composeSoftFail || composeSoftPreview;
  const showComposeSoftFail = composeOwnsSoft;
  /** Compose SoftFail copy owned by azure rail — never inherit noise / timber. */
  const composeSoftCopy = t(locale, "journal.composeSoftFail");
  const composeSoftSupportCopy = t(locale, "journal.composeSoftSupport");
  const hardComposeError =
    error && !isNoiseError(new Error(error)) ? error : null;

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
          <Animated.View style={StyleSheet.flatten([styles.hero, riseStyle])}>
            <Text style={styles.eyebrow}>
              {brand.en}
              {fromCache ? ` · ${t(locale, "offline.offline")}` : ""}
            </Text>
            <Text style={styles.brand}>{brand.zh}</Text>
            <Text style={styles.kicker}>{t(locale, "journal.eyebrow")}</Text>
            <Text style={styles.title}>{trip?.title ?? "—"}</Text>
            <Text style={styles.support}>{t(locale, "journal.support")}</Text>
          </Animated.View>

          <Animated.View style={StyleSheet.flatten([styles.sheet, riseStyle])}>
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
              {/*
                Entry SoftFail helpers (BEA-391 after #284 / BEA-370) + craft
                SoftFail query parity (BEA-424): azure Entries rail · SoftFailBadge
                Soft entries · SoftFailSupport · compact SoftFail mist band ·
                tip-011 mist-wash body. Craft: ?entriesSoftFail=1 — never timber /
                Failed to fetch. Yields while empty SoftFail (#231) owns Entries;
                Compose SoftFail (#247) stays on Compose.
              */}
              <View
                style={StyleSheet.flatten([
                  styles.listHead,
                  showListSoftFail ? styles.listHeadSoft : null,
                ])}
              >
                <View style={styles.listHeadTop}>
                  <View style={styles.listEyebrowRow}>
                    <Text style={styles.listEyebrow}>
                      {t(locale, "journal.listEyebrow")}
                      {" · "}
                      {t(locale, "journal.daySection").replace(
                        "{n}",
                        String(activeDayIndex + 1),
                      )}
                    </Text>
                    {showListSoftFail ? (
                      <SoftFailSupport numberOfLines={2}>
                        {listSoftSupportCopy}
                      </SoftFailSupport>
                    ) : null}
                  </View>
                  <View style={styles.listBadges}>
                    {showListSoftFail ? (
                      <SoftFailBadge>
                        {t(locale, "journal.softBadge")}
                      </SoftFailBadge>
                    ) : null}
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {t(locale, "journal.entryCount").replace(
                          "{n}",
                          String(visible.length),
                        )}
                      </Text>
                    </View>
                    {stopId ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {t(locale, "journal.entryLinked")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.daySectionTitle}>
                  {activeDay?.note ?? activeDay?.date ?? trip?.title ?? "—"}
                </Text>
                {showListSoftFail ? null : (
                  <Text style={styles.entryDetailHint}>
                    {`${activeDay?.date ? `${activeDay.date} · ` : ""}${t(locale, "journal.entryDetailHint")}`}
                  </Text>
                )}
              </View>

              {/* Compact SoftFail mist band under azure Entries rail — never timber. */}
              <SoftFailNotice
                open={showListSoftFail}
                compact
                style={styles.listSoftFail}
              >
                {listSoftCopy}
              </SoftFailNotice>

              <SheetPresence
                open={!loading}
                key={`entries-${dayId ?? "all"}`}
                rise={10}
                delayMs={40}
                style={StyleSheet.flatten([
                  showListSoftFail
                    ? StyleSheet.flatten([
                        softFailMistWashStyle,
                        styles.listBodyWashPad,
                      ])
                    : null,
                ])}
                accessibilityLabel={t(locale, "journal.listEyebrow")}
              >
                {visible.map((entry, index) => {
                  const stop = stops.find((s) => s.id === entry.stopId);
                  const scrubMatch = Boolean(
                    stopId && entry.stopId === stopId,
                  );
                  const isLast = index === visible.length - 1;
                  const placeLabel =
                    stop?.place.name ??
                    days.find((d) => d.id === entry.dayId)?.note ??
                    t(locale, "journal.dayNote");
                  const selectEntry = () => {
                    if (entry.stopId) setStopId(entry.stopId);
                  };
                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: scrubMatch }}
                      accessibilityLabel={`${t(locale, "journal.entryEyebrow")} ${String(index + 1).padStart(2, "0")} · ${placeLabel}`}
                      onPress={selectEntry}
                      style={StyleSheet.flatten([
                        styles.entry,
                        scrubMatch ? styles.entrySelected : null,
                        isLast ? styles.entryLast : null,
                      ])}
                    >
                      <EntryIndexMark n={index + 1} active={scrubMatch} />
                      <View style={styles.entryBodyCol}>
                        <View style={styles.entryMetaRow}>
                          <Text style={styles.entryMeta} numberOfLines={2}>
                            {t(locale, "journal.entryEyebrow")}
                            {" · "}
                            {placeLabel}
                          </Text>
                          {scrubMatch ? (
                            <View style={styles.linkedChip}>
                              <Text style={styles.linkedChipText}>
                                {t(locale, "journal.entryLinked")}
                              </Text>
                            </View>
                          ) : null}
                          {entry.id.startsWith("local-") ? (
                            <View style={styles.pendingChip}>
                              <Text style={styles.pendingChipText}>
                                {t(locale, "offline.pending").replace(
                                  "{n}",
                                  "1",
                                )}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {entry.body ? (
                          <Text
                            style={StyleSheet.flatten([
                              styles.entryBody,
                              scrubMatch ? styles.entryBodySelected : null,
                            ])}
                          >
                            {entry.body}
                          </Text>
                        ) : null}
                        {/* Entry photo strip — lead frame larger (#134 / #124). */}
                        <View
                          style={styles.photoStrip}
                          accessibilityLabel={t(locale, "journal.photoStrip")}
                        >
                          {entry.media.length > 0 ? (
                            <>
                              <View style={styles.photoStripHead}>
                                <Text style={styles.photoStripLabel}>
                                  {t(locale, "journal.photoStrip")}
                                </Text>
                                <View style={styles.badge}>
                                  <Text style={styles.badgeText}>
                                    {t(locale, "journal.photoCount")
                                      .replace(
                                        "{n}",
                                        String(entry.media.length),
                                      )
                                      .replace(
                                        "{max}",
                                        String(
                                          Math.max(
                                            entry.media.length,
                                            PHOTO_SLOT_MAX,
                                          ),
                                        ),
                                      )}
                                  </Text>
                                </View>
                              </View>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                              >
                                {entry.media.map((url, mediaIndex) => (
                                  <Image
                                    key={`${entry.id}-${mediaIndex}`}
                                    source={{ uri: resolveMediaUrl(url) }}
                                    style={StyleSheet.flatten([
                                      styles.thumb,
                                      mediaIndex === 0
                                        ? styles.thumbLead
                                        : null,
                                    ])}
                                  />
                                ))}
                              </ScrollView>
                            </>
                          ) : (
                            <>
                              <Text style={styles.photoSlotsLabel}>
                                {t(locale, "journal.photoSlots")}
                              </Text>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                              >
                                <View style={styles.slot} />
                                <View style={styles.slot} />
                              </ScrollView>
                            </>
                          )}
                        </View>
                      </View>
                    </Pressable>
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
                      style={StyleSheet.flatten([styles.emptyCta])}
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
              </SheetPresence>
            </View>

            {/*
              Compose SoftFail helpers (BEA-391 after #284 / BEA-322) + craft
              SoftFail query parity (BEA-424): foam compose · azure head ·
              SoftFailBadge Soft media · SoftFailSupport · compact SoftFail mist
              band · tip-011 mist-wash body. Craft: ?composeSoftFail=1 — never
              timber / Failed to fetch. Own Compose rail; Entries SoftFail
              (BEA-370) owns the Entries rail — not overlapping chrome.
            */}
            <View
              style={styles.compose}
              accessibilityLabel={t(locale, "journal.compose")}
            >
              <View
                style={StyleSheet.flatten([
                  styles.composeHeader,
                  showComposeSoftFail ? styles.composeHeaderSoft : null,
                ])}
              >
                <View style={styles.composeHeaderTop}>
                  <View style={styles.composeHeaderTitleRow}>
                    <Text style={styles.composeEyebrow}>
                      {t(locale, "journal.composeEyebrow")}
                    </Text>
                    <Text style={styles.composeTitle}>
                      {t(locale, "journal.compose")}
                    </Text>
                    {showComposeSoftFail ? (
                      <SoftFailSupport numberOfLines={2}>
                        {composeSoftSupportCopy}
                      </SoftFailSupport>
                    ) : null}
                  </View>
                  {showComposeSoftFail ? (
                    <SoftFailBadge>
                      {t(locale, "journal.composeSoftBadge")}
                    </SoftFailBadge>
                  ) : null}
                </View>
                {showComposeSoftFail ? null : (
                  <Text style={styles.composeHint}>
                    {t(locale, "journal.composeHint")}
                  </Text>
                )}
              </View>

              {/* Compact SoftFail mist band under azure Compose rail — never timber. */}
              <SoftFailNotice
                open={showComposeSoftFail}
                compact
                style={styles.composeSoftFail}
              >
                {composeSoftCopy}
              </SoftFailNotice>

              <SheetPresence
                open={!loading}
                key={`compose-body-${dayId ?? "all"}`}
                rise={10}
                delayMs={80}
                style={StyleSheet.flatten([
                  styles.composeBody,
                  showComposeSoftFail ? softFailMistWashStyle : null,
                ])}
                accessibilityLabel={t(locale, "journal.compose")}
              >
                <Text style={styles.bindLabel}>
                  {t(locale, "journal.bindStop")}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.bindRow}
                  accessibilityRole="tablist"
                  accessibilityLabel={t(locale, "journal.bindStop")}
                >
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: stopId === "" }}
                    onPress={() => setStopId("")}
                    style={StyleSheet.flatten([
                      styles.bindChip,
                      stopId === "" ? styles.bindChipOn : null,
                    ])}
                  >
                    <Text
                      style={StyleSheet.flatten([
                        styles.bindChipLabel,
                        stopId === "" ? styles.bindChipLabelOn : null,
                      ])}
                    >
                      {t(locale, "journal.dayOnly")}
                    </Text>
                  </Pressable>
                  {dayStops.map((s) => {
                    const on = stopId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        onPress={() => setStopId(s.id)}
                        style={StyleSheet.flatten([
                          styles.bindChip,
                          on ? styles.bindChipOn : null,
                        ])}
                      >
                        <Text
                          style={StyleSheet.flatten([
                            styles.bindChipLabel,
                            on ? styles.bindChipLabelOn : null,
                          ])}
                          numberOfLines={1}
                        >
                          {s.place.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <TextInput
                  ref={composeRef}
                  value={body}
                  onChangeText={setBody}
                  placeholder={t(locale, "journal.placeholder")}
                  placeholderTextColor={colors.inkSoft}
                  multiline
                  style={styles.input}
                />

                <Pressable
                  style={StyleSheet.flatten([styles.photoDrop])}
                  onPress={() => void capture()}
                  accessibilityRole="button"
                  accessibilityLabel={t(locale, "journal.addPhotos")}
                >
                  <Text style={styles.photoDropTitle}>
                    {t(locale, "journal.addPhotos")}
                  </Text>
                  <Text style={styles.photoDropHint}>
                    {t(locale, "journal.uploadHint")}
                  </Text>
                </Pressable>

                <Text style={styles.slotsLabel}>
                  {t(locale, "journal.photoSlots")}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.previewRow}
                >
                  {previewMedia.map((item) => (
                    <Image
                      key={item.key}
                      source={{ uri: item.uri }}
                      style={StyleSheet.flatten([
                        styles.thumb,
                        styles.thumbCompose,
                      ])}
                    />
                  ))}
                  {Array.from({ length: emptySlots }).map((_, i) => (
                    <View
                      key={`slot-${i}`}
                      style={StyleSheet.flatten([
                        styles.slot,
                        styles.slotCompose,
                      ])}
                    />
                  ))}
                </ScrollView>

                {info ? (
                  <Text style={styles.info} accessibilityRole="text">
                    {info}
                  </Text>
                ) : null}
                {hardComposeError ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {hardComposeError}
                  </Text>
                ) : null}

                <Pressable
                  style={StyleSheet.flatten([
                    styles.primary,
                    saving ||
                    (!body.trim() &&
                      pendingMedia.length === 0 &&
                      pendingLocal.length === 0)
                      ? styles.disabled
                      : null,
                  ])}
                  disabled={
                    saving ||
                    (!body.trim() &&
                      pendingMedia.length === 0 &&
                      pendingLocal.length === 0)
                  }
                  onPress={() => void save()}
                >
                  <Text style={styles.primaryLabel}>
                    {saving
                      ? t(locale, "journal.saving")
                      : t(locale, "journal.save")}
                  </Text>
                </Pressable>
              </SheetPresence>
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
    marginBottom: 0,
    backgroundColor: "rgba(244, 246, 250, 0.55)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    paddingLeft: 12,
    marginHorizontal: -4,
  },
  /** Softer azure Entries rail wash while SoftFail owns. */
  listHeadSoft: {
    backgroundColor: "rgba(244, 246, 250, 0.85)",
  },
  listHeadTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  listEyebrowRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  listEyebrow: {
    ...type.body,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
    flexShrink: 1,
  },
  listBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  badge: {
    borderRadius: radius.xs,
    backgroundColor: "rgba(47, 107, 255, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.riverDeep,
    fontVariant: ["tabular-nums"],
  },
  daySectionTitle: {
    ...type.display,
    marginTop: 8,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  entryDetailHint: {
    ...type.body,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  /** Mist SoftFail strip under azure Entries rail — border-b before tip-011 body. */
  listSoftFail: {
    marginBottom: 0,
    marginHorizontal: -4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderTopWidth: 0,
  },
  /** Pad tip-011 SoftFail mist-wash body under azure Entries rail. */
  listBodyWashPad: {
    marginHorizontal: -4,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
  },
  entry: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderRadius: radius.sm,
  },
  entrySelected: {
    backgroundColor: "rgba(47, 107, 255, 0.08)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  entryLast: {
    borderBottomWidth: 0,
  },
  indexMark: {
    marginTop: 2,
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(230, 236, 245, 0.8)",
  },
  indexMarkActive: {
    backgroundColor: colors.river,
    shadowColor: colors.river,
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  indexMarkText: {
    ...type.display,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: colors.inkSoft,
  },
  indexMarkTextActive: {
    color: colors.foam,
  },
  entryBodyCol: {
    flex: 1,
    minWidth: 0,
  },
  entryMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  entryMeta: {
    ...type.body,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "700",
    flexShrink: 1,
  },
  linkedChip: {
    borderRadius: radius.xs,
    backgroundColor: "rgba(47, 107, 255, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  linkedChipText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  pendingChip: {
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pendingChipText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSoft,
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
  entryBodySelected: {
    fontWeight: "700",
  },
  photoStrip: {
    marginTop: 2,
  },
  photoStripHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  photoStripLabel: {
    ...type.body,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(47, 107, 255, 0.8)",
    fontWeight: "700",
  },
  photoSlotsLabel: {
    ...type.body,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(100, 116, 139, 0.7)",
    fontWeight: "600",
    marginBottom: 8,
  },
  thumb: {
    width: 72,
    height: 96,
    marginRight: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.mist,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  thumbLead: {
    width: 84,
    height: 112,
    borderColor: "rgba(47, 107, 255, 0.35)",
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.55)",
  },
  composeHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  /** Softer azure rail wash while SoftFail owns Compose. */
  composeHeaderSoft: {
    backgroundColor: "rgba(244, 246, 250, 0.85)",
  },
  composeHeaderTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  composeHeaderTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    flexShrink: 1,
  },
  composeEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  composeTitle: {
    ...type.display,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  composeHint: {
    ...type.body,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
    flexShrink: 1,
  },
  /** Mist SoftFail strip under azure Compose rail — border-b before tip-011 body. */
  composeSoftFail: {
    marginBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderTopWidth: 0,
  },
  composeBody: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  bindLabel: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.inkSoft,
    marginBottom: 8,
  },
  bindRow: {
    gap: 8,
    paddingBottom: 4,
    marginBottom: 12,
  },
  bindChip: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 180,
  },
  bindChipOn: {
    borderColor: colors.river,
    backgroundColor: "rgba(47, 107, 255, 0.1)",
  },
  bindChipLabel: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  bindChipLabelOn: {
    color: colors.riverDeep,
  },
  input: {
    ...type.body,
    minHeight: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.foam,
    textAlignVertical: "top",
  },
  photoDrop: {
    marginTop: 12,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: "rgba(47, 107, 255, 0.35)",
    backgroundColor: "rgba(230, 236, 245, 0.4)",
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 4,
  },
  photoDropTitle: {
    ...type.body,
    fontSize: 14,
    fontWeight: "700",
    color: colors.river,
  },
  photoDropHint: {
    ...type.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkSoft,
  },
  primary: {
    marginTop: 16,
    backgroundColor: colors.river,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
    shadowColor: colors.river,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  primaryLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
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
  thumbCompose: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47, 107, 255, 0.3)",
  },
  slotCompose: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: "rgba(47, 107, 255, 0.3)",
  },
  disabled: { opacity: 0.4 },
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
