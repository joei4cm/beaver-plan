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
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashStyle,
} from "../../src/components/soft-fail-notice";
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

/** Craft SoftFail query parity with web (`?inviteSoftFail=1`). */
function craftSoftFailOn(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1";
}

/**
 * Expo invite sheet — SoftFail depth kept (BEA-392 / BEA-420 / #228) + wave 48
 * craft residual (BEA-461) + wave 53 residual (BEA-506): paper/inkSoft/sky
 * token alphas · tip-011 Join press · trip title lineHeight. SoftFailBadge ·
 * SoftFailSupport · mist band unchanged. Soft-fail never timber / Failed to
 * fetch. No `/dev` gallery.
 */
export default function InviteScreen() {
  const { code: raw, inviteSoftFail: inviteSoftFailParam } =
    useLocalSearchParams<{
      code: string;
      inviteSoftFail?: string | string[];
    }>();
  const code = typeof raw === "string" ? raw : "";
  /** Craft preview: /invite/…?inviteSoftFail=1 — SoftFail depth under invite. */
  const inviteSoftPreview = craftSoftFailOn(inviteSoftFailParam);
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
      if (inviteSoftPreview) {
        setSoftNotice(t(locale, "invite.softOffline"));
      } else {
        setSoftNotice(null);
      }
    } catch (e) {
      if (isNoiseError(e) || inviteSoftPreview) {
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
  }, [code, inviteSoftPreview]);

  /** Craft SoftFail: seed demo preview so SoftFail depth paints without a miss. */
  useEffect(() => {
    if (!inviteSoftPreview) return;
    setPreview((prev) => prev ?? demoPreview(code));
    setSoftNotice(t(locale, "invite.softOffline"));
    setError(null);
    setLoading(false);
  }, [inviteSoftPreview, code]);

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

  const sheetOpen =
    Boolean(preview) ||
    Boolean(softNotice) ||
    Boolean(error) ||
    inviteSoftPreview;
  const hardError =
    error && !softNotice && !isNoiseError(new Error(error)) ? error : null;
  /**
   * SoftFail owned by invite sheet + craft SoftFail query parity (BEA-420):
   * SoftFailBadge · SoftFailSupport · SoftFailNotice mist band · tip-011.
   * Craft: /invite/…?inviteSoftFail=1 — SoftFail depth without a transport miss.
   * SoftFail copy never timber / Failed to fetch.
   */
  const softFailCopy = t(locale, "invite.softOffline");
  const softCopy = inviteSoftPreview
    ? softFailCopy
    : (softNotice ??
      (error && isNoiseError(new Error(error)) ? softFailCopy : null));
  const softOpen = inviteSoftPreview || Boolean(softCopy);

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
              SoftFail helper adoption (BEA-392) + craft SoftFail query parity
              (BEA-420): SoftFailBadge · SoftFailSupport · softFailMistWashStyle ·
              SoftFailNotice · tip-011. Craft: ?inviteSoftFail=1 — never timber /
              Failed to fetch.
            */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTitles}>
                <Text style={styles.sheetEyebrow}>
                  {t(locale, "invite.sheetEyebrow")}
                </Text>
                {softOpen ? (
                  <SoftFailSupport>
                    {t(locale, "invite.softSupport")}
                  </SoftFailSupport>
                ) : (
                  <Text style={styles.sheetSupport}>
                    {t(locale, "invite.sheetSupport")}
                  </Text>
                )}
              </View>
              <View style={styles.sheetBadges}>
                {softOpen ? (
                  <SoftFailBadge>{t(locale, "invite.softBadge")}</SoftFailBadge>
                ) : (
                  <SoftFailLiveBadge>
                    {t(locale, "invite.liveBadge")}
                  </SoftFailLiveBadge>
                )}
                {preview ? (
                  <Text style={styles.roleChip}>
                    {t(locale, `collab.role.${preview.role}`)}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Compact SoftFail under azure rail — never timber / Failed to fetch. */}
            <SoftFailNotice open={softOpen} compact>
              {softCopy ?? ""}
            </SoftFailNotice>

            <View
              style={StyleSheet.flatten([
                styles.sheetBody,
                softOpen ? softFailMistWashStyle : null,
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
                      style={({ pressed }) =>
                        StyleSheet.flatten([
                          styles.cta,
                          joining ? styles.ctaDisabled : null,
                          pressed && !joining ? styles.ctaPressed : null,
                        ])
                      }
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
    /** Web river wash @ 0.1 */
    backgroundColor: `${colors.river}1A`,
  },
  skyOrb: {
    position: "absolute",
    top: -40,
    right: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
    /** Web focus orb @ 0.14 */
    backgroundColor: `${colors.focus}24`,
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
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: `${colors.river}CC`,
    marginBottom: 10,
  },
  title: {
    ...type.display,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    lineHeight: 40,
    color: colors.ink,
    marginBottom: 10,
  },
  support: {
    ...type.body,
    fontSize: 15,
    lineHeight: 23,
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
    /** Web bg-foam/95 */
    backgroundColor: `${colors.foam}F2`,
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
    /** Web bg-paper/70 */
    backgroundColor: `${colors.paper}B3`,
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
    color: `${colors.inkSoft}CC`,
  },
  sheetBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  roleChip: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.riverDeep,
    backgroundColor: `${colors.river}1F`,
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
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 6,
  },
  destination: {
    ...type.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  tripTitle: {
    ...type.display,
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.6,
    lineHeight: 34,
    color: colors.ink,
  },
  meta: {
    ...type.body,
    marginTop: 4,
    fontSize: 14,
    lineHeight: 21,
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
    backgroundColor: `${colors.river}1A`,
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
  /* tip-011 press — parity with web Join active:scale-[0.98] (BEA-506). */
  ctaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
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
    color: `${colors.inkSoft}CC`,
  },
  error: {
    ...type.body,
    fontSize: 14,
    color: colors.inkSoft,
  },
});
