import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, Stack } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SHARE_ACCENT_PRESETS,
  SHARE_TEMPLATES,
  getShareTemplate,
  renderShareSvg,
  sampleKyotoFixture,
  stopsForDay,
  svgToDataUrl,
  type Day,
  type ShareSnapshot,
  type ShareStyle,
  type ShareTemplateId,
  type Stop,
  type Trip,
} from "@beaver/core";
import { colors, motion, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { fetchTrip, isApiSoftFail, renderShare } from "../../../src/api";
import { SheetPresence } from "../../../src/components/sheet-presence";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashStyle,
} from "../../../src/components/soft-fail-notice";
import { type } from "../../../src/theme";
import {
  patchUserPrefs,
  readUserPrefs,
} from "../../../src/user-prefs";

const locale = "zh-CN" as const;
const DEFAULT_ACCENT = SHARE_ACCENT_PRESETS[0];
/** Match web SHARE_EXPORT_SCALE — 2× hi-res PNG pipeline. */
const SHARE_EXPORT_SCALE = 2;

const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

/** Craft SoftFail query parity with web (`?studioSoftFail=1` / `?exportSoftFail=1`). */
function craftSoftFailOn(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1";
}

export default function ShareScreen() {
  const {
    id,
    studioSoftFail: studioSoftFailParam,
    exportSoftFail: exportSoftFailParam,
  } = useLocalSearchParams<{
    id: string;
    studioSoftFail?: string | string[];
    exportSoftFail?: string | string[];
  }>();
  const tripId = typeof id === "string" ? id : "sample-kyoto";
  /** Craft preview: /trips/…/share?studioSoftFail=1 — SoftFail depth under Export. */
  const studioSoftPreview = craftSoftFailOn(studioSoftFailParam);
  /** Craft preview: /trips/…/share?exportSoftFail=1 — SoftFail depth under Export. */
  const exportSoftPreview = craftSoftFailOn(exportSoftFailParam);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [templateId, setTemplateId] =
    useState<ShareTemplateId>("magazine-reel");
  const [coverTitle, setCoverTitle] = useState("");
  const [coverSubtitle, setCoverSubtitle] = useState("");
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT);
  const [titleScale, setTitleScale] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [softDemo, setSoftDemo] = useState(false);
  const [exportSoftFail, setExportSoftFail] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const rise = useRef(new Animated.Value(0)).current;

  const stylePayload = useMemo((): ShareStyle => {
    const style: ShareStyle = {
      accentColor,
      titleScale,
    };
    if (coverTitle.trim()) style.coverTitle = coverTitle.trim();
    if (coverSubtitle.trim()) style.coverSubtitle = coverSubtitle.trim();
    return style;
  }, [accentColor, coverSubtitle, coverTitle, titleScale]);

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );

  const buildLocalPreview = useCallback((): {
    svg: string;
    previewUrl: string;
  } | null => {
    if (!trip) return null;
    const template = getShareTemplate(templateId);
    if (!template) return null;
    const day = days.find((d) => d.id === dayId);
    const snap: ShareSnapshot = {
      tripTitle: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      dayLabel: day?.note,
      dayDate: day?.date,
      places: dayStops.map((s) => s.place.name),
      photos: [],
      note: day?.note,
      pathPoints: dayStops.map((s) => ({
        lat: s.place.lat,
        lng: s.place.lng,
      })),
      locale: trip.locale === "en" ? "en" : "zh-CN",
      style: stylePayload,
    };
    const markup = renderShareSvg(templateId, snap);
    return { svg: markup, previewUrl: svgToDataUrl(markup) };
  }, [trip, days, dayId, dayStops, templateId, stylePayload]);

  const seedSampleFixture = useCallback(() => {
    if (tripId !== "sample-kyoto") return false;
    const fixture = sampleKyotoFixture();
    setTrip(fixture.trip);
    setDays(fixture.days);
    setStops(fixture.stops);
    setDayId(fixture.days[0]?.id ?? null);
    setCoverTitle(fixture.trip.title);
    setCoverSubtitle(fixture.trip.destination ?? "");
    setSoftDemo(true);
    setError(null);
    return true;
  }, [tripId]);

  const loadTrip = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await readUserPrefs();
      setTemplateId(stored.shareImageTemplateId);
      setPrefsReady(true);
      const data = await fetchTrip(tripId);
      setTrip(data.trip);
      setDays(data.days);
      setStops(data.stops ?? []);
      setDayId(data.days[0]?.id ?? null);
      setCoverTitle(data.trip.title);
      setCoverSubtitle(data.trip.destination ?? "");
      setSoftDemo(false);
      setError(null);
    } catch (e) {
      // Soft-fail: sample-kyoto fixture + SoftFailNotice — never timber / Failed to fetch.
      if (isApiSoftFail(e) && seedSampleFixture()) {
        setPrefsReady(true);
      } else {
        setError(isApiSoftFail(e) ? null : e instanceof Error ? e.message : "load_failed");
        if (isApiSoftFail(e)) setSoftDemo(true);
        setPrefsReady(true);
      }
    } finally {
      setLoading(false);
    }
  }, [tripId, seedSampleFixture]);

  const refreshPreview = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await renderShare({
        tripId,
        templateId,
        dayId: dayId ?? undefined,
        style: stylePayload,
      });
      setPreviewUrl(res.previewUrl);
      setSvg(res.svg);
      setSoftDemo(false);
    } catch {
      const local = buildLocalPreview();
      if (local) {
        setPreviewUrl(local.previewUrl);
        setSvg(local.svg);
        setSoftDemo(true);
        setError(null);
      } else {
        setError("render_failed");
      }
    } finally {
      setBusy(false);
    }
  }, [tripId, templateId, dayId, stylePayload, buildLocalPreview]);

  useEffect(() => {
    void loadTrip();
  }, [loadTrip]);

  useEffect(() => {
    if (!trip || !prefsReady) return;
    const timer = setTimeout(() => {
      void refreshPreview();
    }, 350);
    return () => clearTimeout(timer);
  }, [trip, prefsReady, refreshPreview]);

  useEffect(() => {
    if (loading) return;
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [loading, rise]);

  function pickTemplate(id: ShareTemplateId) {
    if (id === templateId) return;
    setTemplateId(id);
    void patchUserPrefs({ shareImageTemplateId: id });
  }

  /** Soft-fail local SVG download — Expo has no 2× PNG canvas encode (#88 web). */
  async function downloadExport() {
    if (!svg) return;
    setBusy(true);
    setError(null);
    setExportSoftFail(false);
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `beaver-share-${templateId}.svg`;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        // Honest soft-fail: local SVG, not 2× PNG — SoftFailNotice, never timber.
        setExportSoftFail(true);
      } else {
        const path = `${FileSystem.cacheDirectory}beaver-share-${templateId}.svg`;
        await FileSystem.writeAsStringAsync(path, svg, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(path, {
            mimeType: "image/svg+xml",
            dialogTitle: t(locale, "share.downloadPng"),
            UTI: "public.svg-image",
          });
          setExportSoftFail(true);
        } else {
          setExportSoftFail(true);
          if (!softDemo) setSoftDemo(true);
        }
      }
    } catch {
      setExportSoftFail(true);
      setError(null);
      if (!softDemo) setSoftDemo(true);
    } finally {
      setBusy(false);
    }
  }

  async function shareOut() {
    if (!svg) return;
    setBusy(true);
    setError(null);
    setExportSoftFail(false);
    try {
      const available = await Sharing.isAvailableAsync();
      const path = `${FileSystem.cacheDirectory}beaver-share-${templateId}.svg`;
      await FileSystem.writeAsStringAsync(path, svg, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (available) {
        await Sharing.shareAsync(path, {
          mimeType: "image/svg+xml",
          dialogTitle: t(locale, "share.systemShare"),
          UTI: "public.svg-image",
        });
      } else {
        // Soft-fail export demo — never timber / share_unavailable hard fail.
        setExportSoftFail(true);
        if (!softDemo) setSoftDemo(true);
      }
    } catch {
      setExportSoftFail(true);
      setError(null);
      if (!softDemo) setSoftDemo(true);
    } finally {
      setBusy(false);
    }
  }

  const active = SHARE_TEMPLATES.find((x) => x.id === templateId)!;

  /**
   * SoftFail helpers (BEA-397 after #284 / depth BEA-365) + craft SoftFail
   * query parity (BEA-404): SoftFailBadge Soft export / Soft studio ·
   * SoftFailSupport · SoftFailNotice mist band · softFailMistWashStyle tip-011 ·
   * StyleSheet.flatten · never timber / Failed to fetch. Export SoftFail owns
   * when exportSoftFail / `?exportSoftFail=1`; softDemo / `?studioSoftFail=1`
   * SoftFail under Export while Export yields to it when only studio SoftFail
   * (Expo has no Studio SoftFail rail). Craft mirrors web share SoftFail rails.
   * SoftFail depth + helpers kept. No /dev SoftFail gallery.
   */
  const exportOwnsSoft = exportSoftFail || exportSoftPreview;
  const studioSoftOpen =
    (softDemo || studioSoftPreview) && !exportOwnsSoft;
  const softOpen = exportOwnsSoft || studioSoftOpen;
  const exportSupportCopy = exportOwnsSoft
    ? t(locale, "share.exportSoftSupport")
    : studioSoftOpen
      ? t(locale, "share.softSupport")
      : t(locale, "share.exportSupport");
  const exportSoftBadgeCopy = exportOwnsSoft
    ? t(locale, "share.exportSoftBadge")
    : t(locale, "share.softBadge");
  /** SoftFail copy owned by azure Export rail — never timber / Failed to fetch. */
  const exportSoftCopy = exportOwnsSoft
    ? t(locale, "share.exportSoftFail")
    : t(locale, "share.softFail");

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

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t(locale, "mobile.share") }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.river} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Animated.View style={riseStyle}>
            <Text style={styles.eyebrow}>{t(locale, "share.eyebrow")}</Text>
            <Text style={styles.title}>{t(locale, "share.title")}</Text>
            <Text style={styles.support}>
              {trip?.title} · {t(locale, "share.support")}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayRow}
            >
              {days.map((day, i) => {
                const selected = dayId === day.id;
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => setDayId(day.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={StyleSheet.flatten([
                      styles.dayChip,
                      selected ? styles.dayChipActive : null,
                    ])}
                  >
                    <Text
                      style={StyleSheet.flatten([
                        styles.dayLabel,
                        selected ? styles.dayLabelActive : null,
                      ])}
                    >
                      {t(locale, "planner.day")} {i + 1}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Preview stage — paper wash + azure rail hierarchy (#88) */}
            <View style={styles.canvasStage}>
              <View style={styles.canvasRail} pointerEvents="none" />
              <View style={styles.canvasMetaRow}>
                <Text style={styles.canvasEyebrow}>
                  {t(locale, "share.canvasEyebrow")}
                </Text>
                <Text style={styles.canvasRes}>
                  {active.width}×{active.height} · {SHARE_EXPORT_SCALE}× PNG
                </Text>
              </View>
              <View
                style={StyleSheet.flatten([
                  styles.preview,
                  softOpen ? styles.previewSoft : styles.previewHard,
                  { aspectRatio: active.width / active.height },
                ])}
              >
                {previewUrl ? (
                  <Image
                    source={{ uri: previewUrl }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                ) : (
                  <ActivityIndicator color={colors.river} />
                )}
              </View>
            </View>
            <Text style={styles.previewCaption}>
              {active.aspect} · {active.nameZh}
            </Text>

            {/* Template grid picker (#74) */}
            <View
              style={styles.templateSection}
              accessibilityRole="summary"
              accessibilityLabel={t(locale, "share.pickTemplate")}
            >
              <Text style={styles.section}>
                {t(locale, "share.pickTemplate")}
              </Text>
              <Text style={styles.sectionSupport}>
                {t(locale, "share.pickTemplateSupport")}
              </Text>
              <View style={styles.templateGrid}>
                {SHARE_TEMPLATES.map((tpl) => {
                  const selected = templateId === tpl.id;
                  const portrait = tpl.aspect === "9:16";
                  return (
                    <Pressable
                      key={tpl.id}
                      onPress={() => pickTemplate(tpl.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={StyleSheet.flatten([
                        styles.templateCard,
                        selected ? styles.templateCardActive : null,
                      ])}
                    >
                      <View
                        style={StyleSheet.flatten([
                          styles.templateThumb,
                          selected ? styles.templateThumbActive : null,
                          {
                            minHeight: portrait ? 92 : 68,
                          },
                        ])}
                      >
                        <View
                          style={StyleSheet.flatten([
                            styles.templateSilhouette,
                            selected
                              ? styles.templateSilhouetteActive
                              : null,
                            {
                              aspectRatio: tpl.width / tpl.height,
                              maxHeight: portrait ? 76 : 54,
                            },
                          ])}
                        >
                          <View style={styles.silLineWide} />
                          <View style={styles.silLineNarrow} />
                          <View style={styles.silLineBottom} />
                        </View>
                        <View
                          style={StyleSheet.flatten([
                            styles.aspectBadge,
                            selected ? styles.aspectBadgeActive : null,
                          ])}
                        >
                          <Text
                            style={StyleSheet.flatten([
                              styles.aspectBadgeText,
                              selected ? styles.aspectBadgeTextActive : null,
                            ])}
                          >
                            {tpl.aspect}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.templateCopy}>
                        <View style={styles.templateNameRow}>
                          <Text
                            style={StyleSheet.flatten([
                              styles.templateName,
                              selected ? styles.templateNameActive : null,
                            ])}
                          >
                            {tpl.nameZh}
                          </Text>
                          {selected ? (
                            <Text style={styles.selectedBadge}>
                              {t(locale, "share.selected")}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.templateMeta}>{tpl.blurbZh}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Text style={styles.section}>{t(locale, "share.lightEdit")}</Text>
            <Text style={styles.fieldLabel}>
              {t(locale, "share.coverTitle")}
            </Text>
            <TextInput
              value={coverTitle}
              onChangeText={setCoverTitle}
              style={styles.input}
              placeholderTextColor={colors.inkSoft}
            />
            <Text style={styles.fieldLabel}>
              {t(locale, "share.coverSubtitle")}
            </Text>
            <TextInput
              value={coverSubtitle}
              onChangeText={setCoverSubtitle}
              style={styles.input}
              placeholderTextColor={colors.inkSoft}
            />
            <Text style={styles.fieldLabel}>
              {t(locale, "share.accentColor")}
            </Text>
            <View style={styles.accentRow}>
              {SHARE_ACCENT_PRESETS.map((hex) => {
                const selected = accentColor === hex;
                return (
                  <Pressable
                    key={hex}
                    onPress={() => setAccentColor(hex)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={StyleSheet.flatten([
                      styles.accentDot,
                      { backgroundColor: hex },
                      selected ? styles.accentDotActive : null,
                    ])}
                  />
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>
              {t(locale, "share.titleScale")} · {titleScale.toFixed(2)}×
            </Text>
            <View style={styles.scaleRow}>
              {[0.85, 1, 1.15, 1.3].map((s) => {
                const selected = titleScale === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setTitleScale(s)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={StyleSheet.flatten([
                      styles.scaleChip,
                      selected ? styles.scaleChipActive : null,
                    ])}
                  >
                    <Text
                      style={StyleSheet.flatten([
                        styles.scaleChipLabel,
                        selected ? styles.scaleChipLabelActive : null,
                      ])}
                    >
                      {s.toFixed(2)}×
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/*
              Export SoftFail helpers (BEA-397 after #284 / depth BEA-365) +
              craft SoftFail query parity (BEA-404): azure Export rail ·
              SoftFailBadge Soft export / Soft studio · SoftFailSupport ·
              SoftFailNotice mist band · softFailMistWashStyle tip-011 ·
              StyleSheet.flatten · Craft: ?exportSoftFail=1 · ?studioSoftFail=1 —
              never timber / Failed to fetch. No /dev SoftFail gallery.
            */}
            <SheetPresence
              open
              delayMs={90}
              rise={14}
              style={styles.exportSection}
              accessibilityLabel={t(locale, "share.export")}
            >
              <View
                style={styles.exportRail}
                accessibilityRole="summary"
                accessibilityLabel={t(locale, "share.export")}
              >
                <View
                  style={StyleSheet.flatten([
                    styles.exportHeader,
                    softOpen ? styles.exportHeaderSoft : null,
                  ])}
                >
                  <View style={styles.exportHeaderText}>
                    <Text style={styles.exportEyebrow}>
                      {t(locale, "share.exportEyebrow")}
                    </Text>
                    <Text
                      nativeID="expo-share-export-title"
                      style={styles.exportTitle}
                    >
                      {t(locale, "share.export")}
                    </Text>
                    {softOpen ? (
                      <SoftFailSupport style={styles.exportSupportSoft}>
                        {exportSupportCopy}
                      </SoftFailSupport>
                    ) : (
                      <Text style={styles.exportSupport}>
                        {exportSupportCopy}
                      </Text>
                    )}
                  </View>
                  {softOpen ? (
                    <SoftFailBadge>{exportSoftBadgeCopy}</SoftFailBadge>
                  ) : (
                    <SoftFailLiveBadge>
                      {t(locale, "share.liveBadge")}
                    </SoftFailLiveBadge>
                  )}
                </View>

                {/* Compact SoftFail mist band under azure Export rail. */}
                <SoftFailNotice
                  open={softOpen}
                  compact
                  style={styles.softNotice}
                >
                  {exportSoftCopy}
                </SoftFailNotice>

                <View
                  style={StyleSheet.flatten([
                    styles.exportActions,
                    softOpen ? softFailMistWashStyle : null,
                  ])}
                  accessibilityRole="toolbar"
                  accessibilityLabel={t(locale, "share.export")}
                  accessibilityLabelledBy="expo-share-export-title"
                >
                  <SheetPresence open delayMs={40} rise={8}>
                    <Pressable
                      style={StyleSheet.flatten([
                        styles.primary,
                        busy || !svg ? styles.disabled : null,
                      ])}
                      disabled={busy || !svg}
                      onPress={() => void downloadExport()}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy || !svg }}
                    >
                      <Text style={styles.primaryLabel}>
                        {t(locale, "share.downloadPng")}
                      </Text>
                    </Pressable>
                  </SheetPresence>
                  <SheetPresence open delayMs={70} rise={8}>
                    <Pressable
                      style={StyleSheet.flatten([
                        styles.secondaryInk,
                        busy || !svg ? styles.disabled : null,
                      ])}
                      disabled={busy || !svg}
                      onPress={() => void shareOut()}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy || !svg }}
                    >
                      <Text style={styles.secondaryInkLabel}>
                        {t(locale, "share.systemShare")}
                      </Text>
                    </Pressable>
                  </SheetPresence>
                  <SheetPresence open delayMs={100} rise={6}>
                    <View style={styles.exportTertiaryRow}>
                      <Pressable
                        style={StyleSheet.flatten([
                          styles.refreshLink,
                          busy ? styles.disabled : null,
                        ])}
                        disabled={busy}
                        onPress={() => void refreshPreview()}
                        accessibilityRole="button"
                      >
                        <Text style={styles.refreshLinkLabel}>
                          {t(locale, "share.refresh")}
                        </Text>
                      </Pressable>
                      {!softOpen ? (
                        <Text style={styles.demoHint}>
                          {t(locale, "share.demoHint")}
                        </Text>
                      ) : null}
                    </View>
                  </SheetPresence>
                </View>
              </View>
            </SheetPresence>
            {error && !softOpen ? (
              <Text style={styles.error}>{error}</Text>
            ) : null}
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 48, maxWidth: 560, width: "100%", alignSelf: "center" },
  eyebrow: {
    ...type.body,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
    fontWeight: "600",
  },
  title: {
    ...type.display,
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
  },
  support: {
    ...type.body,
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  dayRow: { gap: 8, paddingVertical: 16 },
  dayChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.foam,
    marginRight: 8,
  },
  dayChipActive: {
    backgroundColor: colors.riverDeep,
    borderColor: colors.riverDeep,
  },
  dayLabel: { ...type.body, fontSize: 13, color: colors.inkSoft },
  dayLabelActive: { color: colors.foam, fontWeight: "600" },
  canvasStage: {
    position: "relative",
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 16,
    overflow: "hidden",
    // Paper → sky wash (RN linear approx of web #88 stage)
    backgroundColor: "#DBE8FF",
  },
  canvasRail: {
    position: "absolute",
    left: 0,
    top: 20,
    bottom: 20,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: colors.river,
  },
  canvasMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
    paddingLeft: 8,
  },
  canvasEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  canvasRes: {
    ...type.body,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  preview: {
    width: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.foam,
    alignItems: "center",
    justifyContent: "center",
  },
  previewHard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  previewSoft: {
    borderWidth: 1.5,
    borderColor: "rgba(47,107,255,0.35)",
  },
  previewImage: { width: "100%", height: "100%" },
  previewCaption: {
    ...type.body,
    marginTop: 12,
    marginBottom: 4,
    textAlign: "center",
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(47,107,255,0.7)",
  },
  templateSection: { marginTop: 12 },
  templateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  templateCard: {
    width: "47.5%",
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  templateCardActive: {
    borderColor: colors.river,
    backgroundColor: "rgba(47,107,255,0.08)",
    borderWidth: 1.5,
  },
  templateThumb: {
    position: "relative",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(230,236,245,0.55)",
  },
  templateThumbActive: {
    backgroundColor: "rgba(47,107,255,0.12)",
  },
  templateSilhouette: {
    width: "42%",
    borderRadius: radius.xs,
    overflow: "hidden",
    backgroundColor: "rgba(47,107,255,0.55)",
    marginBottom: 10,
  },
  templateSilhouetteActive: {
    backgroundColor: colors.river,
  },
  silLineWide: {
    marginTop: "18%",
    marginHorizontal: "12%",
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  silLineNarrow: {
    marginTop: "10%",
    marginHorizontal: "12%",
    width: "55%",
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  silLineBottom: {
    position: "absolute",
    left: "14%",
    right: "14%",
    bottom: "14%",
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  aspectBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  aspectBadgeActive: {
    backgroundColor: colors.river,
    borderColor: colors.river,
  },
  aspectBadgeText: {
    ...type.body,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.inkSoft,
  },
  aspectBadgeTextActive: {
    color: colors.foam,
    fontWeight: "600",
  },
  templateCopy: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  templateNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  templateName: {
    ...type.display,
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  templateNameActive: {
    color: colors.river,
  },
  selectedBadge: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
    paddingTop: 2,
  },
  templateMeta: {
    ...type.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkSoft,
  },
  section: {
    ...type.display,
    marginTop: 16,
    marginBottom: 4,
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  sectionSupport: {
    ...type.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  fieldLabel: {
    ...type.body,
    marginTop: 8,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  input: {
    ...type.body,
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.foam,
    color: colors.ink,
    fontSize: 15,
  },
  accentRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  accentDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  accentDotActive: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  scaleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  scaleChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.foam,
  },
  scaleChipActive: {
    backgroundColor: colors.riverDeep,
    borderColor: colors.riverDeep,
  },
  scaleChipLabel: { ...type.body, fontSize: 13, color: colors.inkSoft },
  scaleChipLabelActive: { color: colors.foam, fontWeight: "600" },
  exportSection: {
    marginTop: 24,
  },
  exportRail: {
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    shadowColor: colors.shadowDeep,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  exportHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244,246,250,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  /** Soft azure Export rail wash when SoftFail owns depth (BEA-365). */
  exportHeaderSoft: {
    backgroundColor: "rgba(244,246,250,0.85)",
  },
  exportHeaderText: {
    flex: 1,
    minWidth: 180,
    gap: 4,
  },
  exportEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  exportTitle: {
    ...type.display,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  exportSupport: {
    ...type.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  /** SoftFailSupport keeps flex shrink beside Export title while Soft owns. */
  exportSupportSoft: {
    flexShrink: 1,
  },
  exportBadge: {
    ...type.body,
    alignSelf: "flex-start",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  exportBadgeLive: {
    backgroundColor: "rgba(47,107,255,0.12)",
    color: colors.river,
  },
  /** Mist SoftFail strip under azure Export rail — border-b before tip-011 CTAs. */
  softNotice: {
    marginTop: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderTopWidth: 0,
  },
  exportActions: {
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  primary: {
    backgroundColor: colors.river,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    shadowColor: colors.river,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryLabel: {
    ...type.body,
    color: colors.foam,
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.4,
  },
  secondaryInk: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  secondaryInkLabel: {
    ...type.body,
    color: colors.foam,
    fontWeight: "600",
    fontSize: 14,
  },
  exportTertiaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 2,
  },
  refreshLink: {
    borderRadius: radius.xs,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  refreshLinkLabel: {
    ...type.body,
    fontSize: 14,
    color: colors.inkSoft,
    textDecorationLine: "underline",
    textDecorationColor: "rgba(100,116,139,0.45)",
  },
  demoHint: {
    ...type.body,
    flex: 1,
    maxWidth: 220,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "right",
    color: "rgba(100,116,139,0.75)",
  },
  disabled: { opacity: 0.4 },
  error: {
    ...type.body,
    marginTop: 12,
    color: colors.timber,
    fontSize: 13,
  },
});
