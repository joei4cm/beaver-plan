import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Stack } from "expo-router";
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
import { SoftFailNotice } from "../src/components/soft-fail-notice";
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

const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

/** River uppercase eyebrow — 0.28em tracking parity with web #97. */
function SectionEyebrow({ children }: { children: string }) {
  return <Text style={styles.sectionEyebrow}>{children}</Text>;
}

/** Mist-track segmented control — nested #46 radii, foam/river active. */
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

export default function SettingsScreen() {
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
        // Soft inline notice for any resolve miss — prefs still persist locally.
        setSoftNotice(t(locale, "settings.softOffline"));
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

  // SoftFailNotice under Maps only — hide while resolving; drop plain demo line.
  const showSoftFail = Boolean(softNotice) && !pending;
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

        {/* Language */}
        <View
          style={styles.section}
          accessibilityLabelledBy="settings-locale-heading"
        >
          <View style={styles.sectionHeader}>
            <SectionEyebrow>
              {t(locale, "settings.localeEyebrow")}
            </SectionEyebrow>
            <Text nativeID="settings-locale-heading" style={styles.sectionTitle}>
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

        {/* Map engine — SoftFailNotice stack lives here (section-scoped, rise in/out) */}
        <View
          style={styles.section}
          accessibilityLabelledBy="settings-map-heading"
        >
          <View style={styles.sectionHeader}>
            <SectionEyebrow>{t(locale, "settings.mapEyebrow")}</SectionEyebrow>
            <Text nativeID="settings-map-heading" style={styles.sectionTitle}>
              {t(locale, "settings.mapEngine")}
            </Text>
            <Text style={styles.sectionSupport}>
              {t(locale, "settings.mapEngineSupport")}
            </Text>
          </View>

          <SoftFailNotice open={showSoftFail} style={styles.mapSoftNotice}>
            {softNotice ?? t(locale, "settings.resolvedDemo")}
          </SoftFailNotice>

          <Segmented
            value={prefs.mapEngine}
            options={MAP_OPTS}
            accessibilityLabel={t(locale, "settings.mapEngine")}
            labelFor={(opt) => t(locale, `planner.pref.${opt}` as MessageKey)}
            onChange={(next) => void applyPatch({ mapEngine: next })}
          />

          {statusCopy ? (
            <Text style={styles.resolveLine}>{statusCopy}</Text>
          ) : null}
        </View>

        {/* Distance */}
        <View
          style={styles.section}
          accessibilityLabelledBy="settings-distance-heading"
        >
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

        {/* Share template */}
        <View
          style={StyleSheet.flatten([styles.section, styles.sectionLast])}
          accessibilityLabelledBy="settings-share-heading"
        >
          <View style={styles.sectionHeader}>
            <SectionEyebrow>
              {t(locale, "settings.shareEyebrow")}
            </SectionEyebrow>
            <Text nativeID="settings-share-heading" style={styles.sectionTitle}>
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
  section: {
    marginTop: 36,
    paddingTop: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  sectionLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
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
  mapSoftNotice: {
    marginBottom: 24,
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
