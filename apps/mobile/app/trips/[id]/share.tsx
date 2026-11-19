import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, Stack } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
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
  SHARE_ACCENT_PRESETS,
  SHARE_TEMPLATES,
  type Day,
  type ShareTemplateId,
  type Trip,
} from "@beaver/core";
import { colors } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { fetchTrip, renderShare } from "../../../src/api";

const locale = "zh-CN" as const;
const DEFAULT_ACCENT = SHARE_ACCENT_PRESETS[0];

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = typeof id === "string" ? id : "sample-kyoto";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
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

  const stylePayload = useMemo(
    () => ({
      coverTitle: coverTitle.trim() || undefined,
      coverSubtitle: coverSubtitle.trim() || undefined,
      accentColor,
      titleScale,
    }),
    [accentColor, coverSubtitle, coverTitle, titleScale],
  );

  const loadTrip = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTrip(tripId);
      setTrip(data.trip);
      setDays(data.days);
      setDayId(data.days[0]?.id ?? null);
      setCoverTitle(data.trip.title);
      setCoverSubtitle(data.trip.destination ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "render_failed");
    } finally {
      setBusy(false);
    }
  }, [tripId, templateId, dayId, stylePayload]);

  useEffect(() => {
    void loadTrip();
  }, [loadTrip]);

  useEffect(() => {
    if (!trip) return;
    const timer = setTimeout(() => {
      void refreshPreview();
    }, 350);
    return () => clearTimeout(timer);
  }, [trip, refreshPreview]);

  async function shareOut() {
    if (!svg) return;
    setBusy(true);
    setError(null);
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
        setError("share_unavailable");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "share_failed");
    } finally {
      setBusy(false);
    }
  }

  const active = SHARE_TEMPLATES.find((x) => x.id === templateId)!;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t(locale, "mobile.share") }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.river} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
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
                    styles.dayLabel,
                    dayId === day.id && styles.dayLabelActive,
                  ]}
                >
                  {t(locale, "planner.day")} {i + 1}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View
            style={[
              styles.preview,
              { aspectRatio: active.width / active.height },
            ]}
          >
            {previewUrl ? (
              <Image
                source={{ uri: previewUrl }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            ) : (
              <ActivityIndicator color={colors.foam} />
            )}
          </View>

          {SHARE_TEMPLATES.map((tpl) => (
            <Pressable
              key={tpl.id}
              onPress={() => setTemplateId(tpl.id)}
              style={[
                styles.template,
                templateId === tpl.id && styles.templateActive,
              ]}
            >
              <Text style={styles.templateName}>{tpl.nameZh}</Text>
              <Text style={styles.templateMeta}>
                {tpl.aspect} · {tpl.blurbZh}
              </Text>
            </Pressable>
          ))}

          <Text style={styles.section}>{t(locale, "share.lightEdit")}</Text>
          <Text style={styles.fieldLabel}>{t(locale, "share.coverTitle")}</Text>
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
          <Text style={styles.fieldLabel}>{t(locale, "share.accentColor")}</Text>
          <View style={styles.accentRow}>
            {SHARE_ACCENT_PRESETS.map((hex) => (
              <Pressable
                key={hex}
                onPress={() => setAccentColor(hex)}
                style={[
                  styles.accentDot,
                  { backgroundColor: hex },
                  accentColor === hex && styles.accentDotActive,
                ]}
              />
            ))}
          </View>
          <Text style={styles.fieldLabel}>
            {t(locale, "share.titleScale")} · {titleScale.toFixed(2)}×
          </Text>
          <View style={styles.scaleRow}>
            {[0.85, 1, 1.15, 1.3].map((s) => (
              <Pressable
                key={s}
                onPress={() => setTitleScale(s)}
                style={[
                  styles.scaleChip,
                  titleScale === s && styles.scaleChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.scaleChipLabel,
                    titleScale === s && styles.scaleChipLabelActive,
                  ]}
                >
                  {s.toFixed(2)}×
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void shareOut()}
          >
            <Text style={styles.primaryLabel}>
              {t(locale, "mobile.shareSheet")}
            </Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            disabled={busy}
            onPress={() => void refreshPreview()}
          >
            <Text style={styles.secondaryLabel}>{t(locale, "share.refresh")}</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.river,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "600",
    color: colors.ink,
  },
  support: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
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
    backgroundColor: colors.riverDeep,
    borderColor: colors.riverDeep,
  },
  dayLabel: { fontSize: 13, color: colors.inkSoft },
  dayLabelActive: { color: colors.foam },
  preview: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: { width: "100%", height: "100%" },
  template: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.foam,
  },
  templateActive: {
    borderColor: colors.river,
    backgroundColor: "rgba(47,107,255,0.1)",
  },
  templateName: { fontSize: 17, fontWeight: "600", color: colors.ink },
  templateMeta: { marginTop: 4, fontSize: 13, color: colors.inkSoft },
  section: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  fieldLabel: {
    marginTop: 8,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  input: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 10,
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
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.foam,
  },
  scaleChipActive: {
    backgroundColor: colors.riverDeep,
    borderColor: colors.riverDeep,
  },
  scaleChipLabel: { fontSize: 13, color: colors.inkSoft },
  scaleChipLabelActive: { color: colors.foam },
  primary: {
    marginTop: 16,
    backgroundColor: colors.river,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: colors.foam, fontWeight: "600", fontSize: 15 },
  secondary: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.foam,
  },
  secondaryLabel: { color: colors.inkSoft, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  error: { marginTop: 12, color: colors.timber, fontSize: 13 },
});
