import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { brand, colors, motion, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import type { TripRole } from "@beaver/core";
import { acceptInvite, previewInvite } from "../../src/api";
import { SheetPresence } from "../../src/components/sheet-presence";
import { SoftFailNotice } from "../../src/components/soft-fail-notice";
import { type } from "../../src/theme";

const locale = "zh-CN" as const;
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

type Preview = {
  code: string;
  role: TripRole;
  trip: { id: string; title: string; destination?: string };
};

function isNoiseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /_503$|_502$|_504$|Failed to fetch|Network request failed|load_failed|ECONNREFUSED/i.test(
    msg,
  );
}

function demoPreview(code: string): Preview {
  return {
    code: code || "BP-DEMO42",
    role: "editor",
    trip: {
      id: "sample-kyoto",
      title: "Kyoto · sample",
      destination: "Kyoto",
    },
  };
}

/**
 * Expo invite SoftFailNotice depth (BEA-300 after #186):
 * azure sheet rail · Soft/Live badge · softSupport · compact SoftFailNotice
 * (border-b) · mist-wash trip preview · tip-011 SheetPresence stagger ·
 * StyleSheet.flatten Pressables. Soft-fail never timber / Failed to fetch.
 */
export default function InviteScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" ? raw : "";
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const rise = useRef(new Animated.Value(0)).current;

  const brandName = locale === "zh-CN" ? brand.zh : brand.en;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await previewInvite(code);
      setPreview(data);
      setSoftNotice(null);
    } catch (e) {
      if (isNoiseError(e)) {
        setPreview(demoPreview(code));
        setSoftNotice(t(locale, "invite.softOffline"));
        setError(null);
      } else {
        setPreview(null);
        setSoftNotice(null);
        setError(e instanceof Error ? e.message : "invite_invalid");
      }
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) {
      rise.setValue(0);
      return;
    }
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [loading, preview, softNotice, error, rise]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      if (softNotice) {
        router.replace(`/trips/${preview?.trip.id ?? "sample-kyoto"}`);
        return;
      }
      const res = await acceptInvite(code);
      router.replace(`/trips/${res.trip.id}`);
    } catch (e) {
      if (isNoiseError(e)) {
        setSoftNotice(t(locale, "invite.softOffline"));
        router.replace(`/trips/${preview?.trip.id ?? "sample-kyoto"}`);
        return;
      }
      setError(e instanceof Error ? e.message : "join_failed");
      setJoining(false);
    }
  }

  const sheetOpen = Boolean(preview) || Boolean(softNotice) || Boolean(error);
  const hardError =
    error && !softNotice && !isNoiseError(new Error(error)) ? error : null;
  const softCopy =
    softNotice ??
    (error && isNoiseError(new Error(error))
      ? t(locale, "invite.softOffline")
      : null);
  const softOpen = Boolean(softCopy);

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
      <Stack.Screen
        options={{
          title: t(locale, "invite.title"),
          headerStyle: { backgroundColor: colors.foam },
          headerTintColor: colors.ink,
        }}
      />
      <View style={styles.sky} pointerEvents="none" />
      <View style={styles.skyOrb} pointerEvents="none" />

      {loading && !preview && !error && !softNotice ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.river} />
          <Text style={styles.loadingLabel}>{t(locale, "invite.loading")}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={riseStyle}>
            <Text style={styles.eyebrow}>{brandName}</Text>
            <Text style={styles.title}>{t(locale, "invite.title")}</Text>
            <Text style={styles.support}>{t(locale, "invite.support")}</Text>
          </Animated.View>

          <SheetPresence
            open={sheetOpen}
            delayMs={90}
            rise={18}
            style={styles.sheet}
            accessibilityLabel={t(locale, "invite.title")}
          >
            {/*
              SoftFail depth (BEA-300 after #186):
              azure rail · Soft/Live · softSupport · SoftFailNotice · tip-011 —
              never timber / Failed to fetch.
            */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTitles}>
                <Text style={styles.sheetEyebrow}>
                  {t(locale, "invite.sheetEyebrow")}
                </Text>
                <Text style={styles.sheetSupport}>
                  {softOpen
                    ? t(locale, "invite.softSupport")
                    : t(locale, "invite.sheetSupport")}
                </Text>
              </View>
              <View style={styles.sheetBadges}>
                <Text
                  style={StyleSheet.flatten([
                    styles.statusBadge,
                    softOpen ? styles.statusBadgeSoft : styles.statusBadgeLive,
                  ])}
                >
                  {softOpen
                    ? t(locale, "invite.softBadge")
                    : t(locale, "invite.liveBadge")}
                </Text>
                {preview ? (
                  <Text style={styles.roleChip}>
                    {t(locale, `collab.role.${preview.role}`)}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Compact SoftFail under azure rail — never timber / Failed to fetch. */}
            <SoftFailNotice
              open={softOpen}
              compact
              style={styles.sheetSoftFail}
            >
              {softCopy ?? ""}
            </SoftFailNotice>

            <View
              style={StyleSheet.flatten([
                styles.sheetBody,
                softOpen ? styles.sheetBodySoft : null,
              ])}
            >
              {hardError ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {hardError}
                </Text>
              ) : null}

              {preview ? (
                <>
                  <SheetPresence
                    open
                    delayMs={40}
                    rise={10}
                    style={StyleSheet.flatten([
                      styles.tripInset,
                      softOpen ? styles.tripInsetSoft : null,
                    ])}
                  >
                    <Text style={styles.previewEyebrow}>
                      {t(locale, "invite.previewEyebrow")}
                    </Text>
                    <SheetPresence open delayMs={80} rise={8}>
                      <Text style={styles.destination}>
                        {preview.trip.destination ?? t(locale, "planner.trip")}
                      </Text>
                    </SheetPresence>
                    <SheetPresence open delayMs={120} rise={8}>
                      <Text style={styles.tripTitle}>{preview.trip.title}</Text>
                    </SheetPresence>
                    <SheetPresence open delayMs={160} rise={6}>
                      <Text style={styles.meta}>
                        {t(locale, "invite.asRole")}{" "}
                        <Text style={styles.metaRole}>
                          {t(locale, `collab.role.${preview.role}`)}
                        </Text>
                        {" · "}
                        <Text style={styles.codeChip}>
                          {preview.code.toUpperCase()}
                        </Text>
                      </Text>
                    </SheetPresence>
                  </SheetPresence>

                  <SheetPresence open delayMs={200} rise={8} style={styles.ctaRow}>
                    <Pressable
                      style={StyleSheet.flatten([
                        styles.cta,
                        joining ? styles.ctaDisabled : null,
                      ])}
                      disabled={joining}
                      onPress={() => void join()}
                      accessibilityRole="button"
                    >
                      <Text style={styles.ctaLabel}>
                        {joining
                          ? t(locale, "invite.joining")
                          : t(locale, "invite.join")}
                      </Text>
                    </Pressable>
                  </SheetPresence>

                  <SheetPresence open delayMs={240} rise={6}>
                    <Text style={styles.demoNote}>
                      {t(locale, "invite.demoNote")}
                    </Text>
                  </SheetPresence>
                </>
              ) : null}
            </View>
          </SheetPresence>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  sky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: "rgba(219, 232, 255, 0.55)",
  },
  skyOrb: {
    position: "absolute",
    top: -40,
    right: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(96, 165, 250, 0.16)",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingLabel: {
    ...type.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    ...type.body,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: "rgba(47, 107, 255, 0.8)",
    marginBottom: 10,
  },
  title: {
    ...type.display,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.ink,
    marginBottom: 10,
  },
  support: {
    ...type.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    maxWidth: 420,
    marginBottom: 22,
  },
  sheet: {
    marginTop: 8,
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  sheetHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  sheetHeaderTitles: {
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
    color: "rgba(71, 85, 105, 0.8)",
  },
  sheetBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  statusBadge: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  statusBadgeSoft: {
    color: colors.inkSoft,
    backgroundColor: colors.mist,
  },
  statusBadgeLive: {
    color: colors.river,
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  roleChip: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.riverDeep,
    backgroundColor: "rgba(47, 107, 255, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    overflow: "hidden",
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
  },
  /** Mist SoftFail strip under azure rail — border-b before mist body. */
  sheetSoftFail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderTopWidth: 0,
  },
  sheetBody: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 16,
    backgroundColor: "rgba(230, 236, 245, 0.18)",
  },
  sheetBodySoft: {
    backgroundColor: "rgba(230, 236, 245, 0.32)",
  },
  tripInset: {
    gap: 6,
    overflow: "hidden",
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.42)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  tripInsetSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.55)",
  },
  previewEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 6,
  },
  destination: {
    ...type.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  tripTitle: {
    ...type.display,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: colors.ink,
  },
  meta: {
    ...type.body,
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  metaRole: {
    fontWeight: "700",
    color: colors.river,
  },
  codeChip: {
    fontFamily: "monospace",
    letterSpacing: 1.2,
    color: colors.riverDeep,
    backgroundColor: "rgba(47, 107, 255, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    overflow: "hidden",
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
  },
  ctaRow: {
    alignSelf: "flex-start",
  },
  cta: {
    alignSelf: "flex-start",
    backgroundColor: colors.river,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: colors.river,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 15,
    fontWeight: "700",
  },
  demoNote: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(71, 85, 105, 0.8)",
  },
  error: {
    ...type.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
});
