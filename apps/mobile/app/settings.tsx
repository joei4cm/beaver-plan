import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SHARE_TEMPLATES, type Trip } from "@beaver/core";
import { brand, colors, motion, radius } from "@beaver/ui-tokens";
import { t, type Locale, type MessageKey } from "@beaver/i18n";
import { fetchMapEngine, type EngineResolve } from "../src/api";
import { SheetPresence } from "../src/components/sheet-presence";
import {
  SoftFailBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailBandStyle,
  softFailMistWashStyle,
} from "../src/components/soft-fail-notice";
import { type } from "../src/theme";
import {
  type DistanceUnit,
  type UserPrefs,
  DEFAULT_USER_PREFS,
  patchUserPrefs,
  readUserPrefs,
} from "../src/user-prefs";

const MAP_OPTS: Trip["mapEngine"][] = ["auto", "google", "amap", "baidu"];
const LOCALE_OPTS: Locale[] = ["zh-CN", "en"];
const DISTANCE_OPTS: DistanceUnit[] = ["km", "mi"];

/** Tip 011 — ease-out-strong (#46). */
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

/** Craft SoftFail query parity with web (`?settingsSoftFail=1`). */
function craftSoftFailOn(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1";
}

/** River uppercase eyebrow — 0.28em tracking parity with web #162. */
function SectionEyebrow({ children }: { children: string }) {
  return <Text style={styles.sectionEyebrow}>{children}</Text>;
}

/** Mist-track segmented control — nested #46 radii, foam/river active, tip-011. */
function Segmented<T extends string>({
  value,
  options,
  labelFor,
  onChange,
  accessibilityLabel,
}: {
  value: T;
  options: readonly T[];
  labelFor: (opt: T) => string;
  onChange: (opt: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View
      style={styles.track}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={StyleSheet.flatten([
              styles.chip,
              active ? styles.chipActive : null,
            ])}
          >
            <Text
              style={StyleSheet.flatten([
                styles.chipLabel,
                active ? styles.chipLabelActive : null,
              ])}
            >
              {labelFor(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Expo settings SoftFail helper adoption (BEA-395 after #284 / depth #222) +
 * craft SoftFail query parity (BEA-403):
 * SoftFailBadge · SoftFailSupport · softFailBandStyle · softFailMistWashStyle ·
 * compact SoftFail mist band under azure Device rail · tip-011 SheetPresence
 * mist-wash Language / Maps · StyleSheet.flatten. Craft:
 * /settings?settingsSoftFail=1 — SoftFail depth without a resolve miss.
 * SoftFail copy always softFail (never timber / Failed to fetch) — prefs still
 * save locally.
 */
export default function SettingsScreen() {
  const { settingsSoftFail: settingsSoftFailParam } = useLocalSearchParams<{
    settingsSoftFail?: string | string[];
  }>();
  /** Craft preview: /settings?settingsSoftFail=1 — SoftFail depth under Device. */
  const settingsSoftPreview = craftSoftFailOn(settingsSoftFailParam);
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_USER_PREFS);
  const [hydrated, setHydrated] = useState(false);
  const [resolve, setResolve] = useState<EngineResolve | null>(null);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const rise = useRef(new Animated.Value(0)).current;

  const locale = prefs.locale;
  const brandName = locale === "zh-CN" ? brand.zh : brand.en;

  const probeEngine = useCallback(
    async (preference: Trip["mapEngine"]) => {
      setPending(true);
      try {
        const tz =
          typeof Intl !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : "";
        const res = await fetchMapEngine({ preference, timezone: tz });
        setResolve(res);
        setSoftNotice(null);
      } catch {
        setResolve(null);
        // SoftFail under Device rail — prefs still persist locally; never timber.
        setSoftNotice(t(locale, "settings.softFail"));
      } finally {
        setPending(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readUserPrefs();
      if (cancelled) return;
      setPrefs(stored);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void probeEngine(prefs.mapEngine);
  }, [hydrated, prefs.mapEngine, probeEngine]);

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [rise]);

  async function applyPatch(patch: Partial<UserPrefs>) {
    const next = await patchUserPrefs(patch);
    setPrefs(next);
  }

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

  /**
   * Device rail owns SoftFail under azure prefs chrome. SoftFail copy always
   * softFail (never inherit noise / timber). Hide while resolving unless craft
   * `?settingsSoftFail=1` forces SoftFail depth.
   */
  const sectionOwnsSoft = settingsSoftPreview || Boolean(softNotice);
  const sectionSoftOpen = settingsSoftPreview
    ? true
    : sectionOwnsSoft && !pending;
  const softCopy = softNotice ?? t(locale, "settings.softFail");
  const statusCopy = pending
    ? t(locale, "settings.resolving")
    : resolve
      ? t(locale, "settings.resolved")
          .replace("{engine}", resolve.engineId)
          .replace("{mode}", resolve.mode)
          .replace("{region}", resolve.region)
      : null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen
        options={{
          title: t(locale, "settings.title"),
          headerStyle: { backgroundColor: colors.foam },
          headerTintColor: colors.ink,
        }}
      />

      <View style={styles.sky} pointerEvents="none" />
      <View style={styles.skyOrb} pointerEvents="none" />

      <Animated.View style={riseStyle}>
        <View style={styles.pageHeader}>
          <Text style={styles.eyebrow}>{t(locale, "settings.eyebrow")}</Text>
          <Text style={styles.title}>{t(locale, "settings.title")}</Text>
          <Text style={styles.support}>{t(locale, "settings.support")}</Text>
          <Text style={styles.localHint}>
            {brandName} · {t(locale, "settings.localHint")}
          </Text>
        </View>

        {/*
          SoftFail helper adoption (BEA-395) + craft SoftFail query parity
          (BEA-403): SoftFailBadge · SoftFailSupport · softFailBandStyle ·
          softFailMistWashStyle · SoftFailNotice · tip-011. Craft:
          ?settingsSoftFail=1 — never timber / Failed to fetch.
        */}
        <View
          style={styles.prefsSheet}
          accessibilityLabel={t(locale, "settings.sheetEyebrow")}
        >
          <View
            style={StyleSheet.flatten([
              styles.sheetRail,
              sectionSoftOpen ? styles.sheetRailSoft : null,
            ])}
          >
            <View style={styles.sheetRailCopy}>
              <Text style={styles.sheetEyebrow}>
                {t(locale, "settings.sheetEyebrow")}
              </Text>
              {sectionSoftOpen ? (
                <SoftFailSupport style={styles.softSupportShrink}>
                  {t(locale, "settings.softSupport")}
                </SoftFailSupport>
              ) : (
                <Text style={styles.sheetSupport}>
                  {t(locale, "settings.sheetSupport")}
                </Text>
              )}
            </View>
            {sectionSoftOpen ? (
              <SoftFailBadge>{t(locale, "settings.softBadge")}</SoftFailBadge>
            ) : (
              <View
                style={StyleSheet.flatten([
                  styles.statusBadge,
                  styles.statusBadgeLocal,
                ])}
              >
                <Text
                  style={StyleSheet.flatten([
                    styles.statusBadgeText,
                    styles.statusBadgeTextLocal,
                  ])}
                >
                  {t(locale, "settings.localBadge")}
                </Text>
              </View>
            )}
          </View>

          {/* Compact SoftFail mist band under azure Device rail — never timber. */}
          <SoftFailNotice
            open={sectionSoftOpen}
            compact
            style={softFailBandStyle}
          >
            {softCopy}
          </SoftFailNotice>

          {/* Language */}
          <SheetPresence
            open={hydrated}
            delayMs={60}
            rise={10}
            style={StyleSheet.flatten([
              styles.section,
              sectionSoftOpen ? softFailMistWashStyle : null,
            ])}
            accessibilityLabel={t(locale, "settings.locale")}
          >
            <View
              accessibilityLabelledBy="settings-locale-heading"
            >
              <View style={styles.sectionHeader}>
                <SectionEyebrow>
                  {t(locale, "settings.localeEyebrow")}
                </SectionEyebrow>
                <Text
                  nativeID="settings-locale-heading"
                  style={styles.sectionTitle}
                >
                  {t(locale, "settings.locale")}
                </Text>
                <Text style={styles.sectionSupport}>
                  {t(locale, "settings.localeSupport")}
                </Text>
              </View>
              <Segmented
                value={prefs.locale}
                options={LOCALE_OPTS}
                accessibilityLabel={t(locale, "settings.locale")}
                labelFor={(opt) =>
                  t(locale, `settings.locale.${opt}` as MessageKey)
                }
                onChange={(next) => void applyPatch({ locale: next })}
              />
            </View>
          </SheetPresence>

          {/* Map engine — soft-fail owned by Device rail above (mist-wash body). */}
          <SheetPresence
            open={hydrated}
            delayMs={90}
            rise={10}
            style={StyleSheet.flatten([
              styles.section,
              styles.sectionBordered,
              sectionSoftOpen ? softFailMistWashStyle : null,
              sectionSoftOpen ? styles.sectionMapsRail : null,
            ])}
            accessibilityLabel={t(locale, "settings.mapEngine")}
          >
            <View accessibilityLabelledBy="settings-map-heading">
              <View style={styles.sectionHeader}>
                <SectionEyebrow>
                  {t(locale, "settings.mapEyebrow")}
                </SectionEyebrow>
                <Text
                  nativeID="settings-map-heading"
                  style={styles.sectionTitle}
                >
                  {t(locale, "settings.mapEngine")}
                </Text>
                <Text style={styles.sectionSupport}>
                  {t(locale, "settings.mapEngineSupport")}
                </Text>
              </View>

              <Segmented
                value={prefs.mapEngine}
                options={MAP_OPTS}
                accessibilityLabel={t(locale, "settings.mapEngine")}
                labelFor={(opt) =>
                  t(locale, `planner.pref.${opt}` as MessageKey)
                }
                onChange={(next) => void applyPatch({ mapEngine: next })}
              />

              {statusCopy ? (
                <Text style={styles.resolveLine}>{statusCopy}</Text>
              ) : null}
            </View>
          </SheetPresence>

          {/* Distance */}
          <SheetPresence
            open={hydrated}
            delayMs={120}
            rise={10}
            style={StyleSheet.flatten([styles.section, styles.sectionBordered])}
            accessibilityLabel={t(locale, "settings.distance")}
          >
            <View accessibilityLabelledBy="settings-distance-heading">
              <View style={styles.sectionHeader}>
                <SectionEyebrow>
                  {t(locale, "settings.distanceEyebrow")}
                </SectionEyebrow>
                <Text
                  nativeID="settings-distance-heading"
                  style={styles.sectionTitle}
                >
                  {t(locale, "settings.distance")}
                </Text>
                <Text style={styles.sectionSupport}>
                  {t(locale, "settings.distanceSupport")}
                </Text>
              </View>
              <Segmented
                value={prefs.distanceUnit}
                options={DISTANCE_OPTS}
                accessibilityLabel={t(locale, "settings.distance")}
                labelFor={(opt) =>
                  t(locale, `settings.distance.${opt}` as MessageKey)
                }
                onChange={(next) => void applyPatch({ distanceUnit: next })}
              />
            </View>
          </SheetPresence>

          {/* Share template */}
          <SheetPresence
            open={hydrated}
            delayMs={150}
            rise={10}
            style={StyleSheet.flatten([
              styles.section,
              styles.sectionBordered,
              styles.sectionLast,
            ])}
            accessibilityLabel={t(locale, "settings.shareTemplate")}
          >
            <View accessibilityLabelledBy="settings-share-heading">
              <View style={styles.sectionHeader}>
                <SectionEyebrow>
                  {t(locale, "settings.shareEyebrow")}
                </SectionEyebrow>
                <Text
                  nativeID="settings-share-heading"
                  style={styles.sectionTitle}
                >
                  {t(locale, "settings.shareTemplate")}
                </Text>
                <Text style={styles.sectionSupport}>
                  {t(locale, "settings.shareTemplateSupport")}
                </Text>
              </View>
              {SHARE_TEMPLATES.map((tpl, index) => {
                const selected = prefs.shareImageTemplateId === tpl.id;
                const name = locale === "zh-CN" ? tpl.nameZh : tpl.nameEn;
                const blurb = locale === "zh-CN" ? tpl.blurbZh : tpl.blurbEn;
                return (
                  <Pressable
                    key={tpl.id}
                    onPress={() =>
                      void applyPatch({ shareImageTemplateId: tpl.id })
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={StyleSheet.flatten([
                      styles.shareRow,
                      selected ? styles.shareRowSelected : null,
                      index === SHARE_TEMPLATES.length - 1
                        ? styles.shareRowLast
                        : null,
                    ])}
                  >
                    <Text
                      style={StyleSheet.flatten([
                        styles.shareIndex,
                        selected ? styles.shareIndexSelected : null,
                      ])}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                    <View style={styles.shareCopy}>
                      <Text
                        style={StyleSheet.flatten([
                          styles.shareName,
                          selected ? styles.shareNameSelected : null,
                        ])}
                      >
                        {name}
                      </Text>
                      <Text style={styles.shareBlurb}>{blurb}</Text>
                    </View>
                    {selected ? (
                      <Text style={styles.shareBadge}>
                        {t(locale, "settings.selected")}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </SheetPresence>
        </View>

        <Link href="/trips" asChild>
          <Pressable style={styles.backLink}>
            <Text style={styles.backLinkText}>
              ← {t(locale, "nav.trips")}
            </Text>
          </Pressable>
        </Link>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  sky: {
    ...StyleSheet.absoluteFillObject,
    height: 280,
    backgroundColor: "#DBE8FF",
    opacity: 0.55,
  },
  skyOrb: {
    position: "absolute",
    top: -40,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(96, 165, 250, 0.18)",
  },
  pageHeader: {
    marginBottom: 8,
  },
  eyebrow: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.8,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 10,
  },
  title: {
    ...type.display,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.ink,
    lineHeight: 42,
  },
  support: {
    ...type.body,
    marginTop: 14,
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkSoft,
    maxWidth: 420,
  },
  localHint: {
    ...type.body,
    marginTop: 8,
    fontSize: 13,
    color: "rgba(100, 116, 139, 0.85)",
  },
  prefsSheet: {
    marginTop: 28,
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sheetRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetRailCopy: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  sheetEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
  },
  sheetSupport: {
    ...type.body,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(100, 116, 139, 0.85)",
  },
  softSupportShrink: {
    flexShrink: 1,
    minWidth: 0,
  },
  sheetRailSoft: {
    backgroundColor: "rgba(244, 246, 250, 0.85)",
  },
  statusBadge: {
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeLocal: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  statusBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  statusBadgeTextLocal: {
    color: colors.river,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 28,
  },
  sectionBordered: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  sectionLast: {
    paddingBottom: 20,
  },
  /** Azure Maps inset while SoftFail owns — mist-wash via softFailMistWashStyle. */
  sectionMapsRail: {
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  sectionHeader: {
    marginBottom: 24,
  },
  sectionEyebrow: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  sectionTitle: {
    ...type.display,
    marginTop: 12,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  sectionSupport: {
    ...type.body,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkSoft,
    maxWidth: 400,
  },
  track: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "flex-start",
    gap: 2,
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.5)",
    padding: 4,
  },
  chip: {
    borderRadius: radius.xs,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: colors.foam,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  chipLabel: {
    ...type.body,
    fontSize: 14,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  chipLabelActive: {
    color: colors.river,
    fontWeight: "700",
  },
  resolveLine: {
    ...type.body,
    marginTop: 14,
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
    paddingLeft: 12,
    paddingVertical: 18,
  },
  shareRowSelected: {
    borderLeftColor: colors.river,
    backgroundColor: "rgba(47, 107, 255, 0.04)",
  },
  shareRowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shareIndex: {
    ...type.display,
    fontSize: 18,
    fontWeight: "700",
    color: colors.mist,
    minWidth: 28,
  },
  shareIndexSelected: {
    color: colors.river,
  },
  shareCopy: {
    flex: 1,
    minWidth: 0,
  },
  shareName: {
    ...type.display,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  shareNameSelected: {
    color: colors.river,
  },
  shareBlurb: {
    ...type.body,
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  shareBadge: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
    marginTop: 4,
  },
  backLink: {
    marginTop: 28,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  backLinkText: {
    ...type.body,
    fontSize: 14,
    fontWeight: "700",
    color: colors.river,
  },
});
