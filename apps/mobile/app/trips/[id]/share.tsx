import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, Stack } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
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
  SHARE_ACCENT_PRESETS,
  SHARE_TEMPLATES,
  getShareTemplate,
  renderShareSvg,
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
import { fetchTrip, renderShare } from "../../../src/api";
import { SoftFailNotice } from "../../../src/components/soft-fail-notice";
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

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = typeof id === "string" ? id : "sample-kyoto";
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
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
      setPrefsReady(true);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

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
          dialogTitle: t(locale, "mobile.shareSheet"),
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
                  softDemo || exportSoftFail
                    ? styles.previewSoft
                    : styles.previewHard,
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

            <SoftFailNotice
              open={softDemo || exportSoftFail}
              style={styles.softNotice}
            >
              {exportSoftFail
                ? t(locale, "share.exportSoftFail")
                : t(locale, "share.demoNotice")}
            </SoftFailNotice>

            <Pressable
              style={StyleSheet.flatten([
                styles.primary,
                busy ? styles.disabled : null,
              ])}
              disabled={busy}
              onPress={() => void shareOut()}
              accessibilityRole="button"
            >
              <Text style={styles.primaryLabel}>
                {t(locale, "mobile.shareSheet")}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              disabled={busy}
              onPress={() => void refreshPreview()}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryLabel}>
                {t(locale, "share.refresh")}
              </Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
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
  softNotice: {
    marginTop: 16,
  },
  primary: {
    marginTop: 16,
    backgroundColor: colors.river,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    ...type.body,
    color: colors.foam,
    fontWeight: "600",
    fontSize: 15,
  },
  secondary: {
    marginTop: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.foam,
  },
  secondaryLabel: {
    ...type.body,
    color: colors.inkSoft,
    fontWeight: "600",
  },
  disabled: { opacity: 0.45 },
  error: {
    ...type.body,
    marginTop: 12,
    color: colors.timber,
    fontSize: 13,
  },
});
