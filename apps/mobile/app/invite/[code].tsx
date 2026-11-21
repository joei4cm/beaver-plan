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
  const sheet = useRef(new Animated.Value(0)).current;

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
      sheet.setValue(0);
      return;
    }
    rise.setValue(0);
    sheet.setValue(0);
    Animated.parallel([
      Animated.timing(rise, {
        toValue: 1,
        duration: motion.durationMdMs,
        easing: easeRise,
        useNativeDriver: true,
      }),
      Animated.timing(sheet, {
        toValue: 1,
        duration: motion.durationLgMs,
        delay: 90,
        easing: easeRise,
        useNativeDriver: true,
      }),
    ]).start();
  }, [loading, preview, softNotice, error, rise, sheet]);

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

  const sheetStyle = {
    opacity: sheet,
    transform: [
      {
        translateY: sheet.interpolate({
          inputRange: [0, 1],
          outputRange: [22, 0],
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

          {sheetOpen ? (
            <Animated.View
              style={StyleSheet.flatten([styles.sheet, sheetStyle])}
              accessibilityLabel={t(locale, "invite.title")}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetEyebrow}>
                  {t(locale, "invite.title")}
                </Text>
                {preview ? (
                  <Text style={styles.roleChip}>
                    {t(locale, `collab.role.${preview.role}`)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.sheetBody}>
                <SoftFailNotice open={Boolean(softNotice)}>
                  {softNotice ?? ""}
                </SoftFailNotice>

                {error && !softNotice ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}

                {preview ? (
                  <>
                    <View style={styles.tripBlock}>
                      <Text style={styles.destination}>
                        {preview.trip.destination ??
                          t(locale, "planner.trip")}
                      </Text>
                      <Text style={styles.tripTitle}>{preview.trip.title}</Text>
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
                    </View>

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

                    <Text style={styles.demoNote}>
                      {t(locale, "invite.demoNote")}
                    </Text>
                  </>
                ) : null}
              </View>
            </Animated.View>
          ) : null}
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
  },
  sheetEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.inkSoft,
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
  },
  sheetBody: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 16,
  },
  tripBlock: {
    gap: 6,
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
    color: colors.timber,
  },
});
