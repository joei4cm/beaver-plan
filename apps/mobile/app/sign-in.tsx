import { useOAuth, useAuth } from "@clerk/clerk-expo";
import type { OAuthStrategy } from "@clerk/types";
import { Link, Stack, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { fetchHealth } from "../src/api";
import { SheetPresence } from "../src/components/sheet-presence";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashStyle,
} from "../src/components/soft-fail-notice";
import { clerkEnabled, wechatLoginEnabled } from "../src/clerk";
import { type } from "../src/theme";

WebBrowser.maybeCompleteAuthSession();

const locale = "zh-CN" as const;
/** Clerk Dashboard WeChat social connection — not in published OAuthProvider union yet. */
const WECHAT_STRATEGY = "oauth_wechat" as OAuthStrategy;
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

/** Craft SoftFail query parity with web (`?signInSoftFail=1`). */
function craftSoftFailOn(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1";
}

/**
 * Expo auth SoftFail helper adoption (BEA-392 after #284 / depth #269) + craft
 * SoftFail query parity (BEA-421): SoftFailBadge · SoftFailSupport ·
 * softFailMistWashStyle · compact SoftFail mist band under azure rail ·
 * WeChat SoftFail yield (no double depth). Craft: /sign-in?signInSoftFail=1 —
 * SoftFail depth without a Clerk/API miss. SoftFail copy never timber /
 * Failed to fetch. No `/dev` SoftFail gallery. Web sign-up SoftFail is sibling
 * scope (Expo has no sign-up screen).
 */
export default function SignInScreen() {
  const { signInSoftFail: signInSoftFailParam } = useLocalSearchParams<{
    signInSoftFail?: string | string[];
  }>();
  /** Craft preview: /sign-in?signInSoftFail=1 — SoftFail depth under azure rail. */
  const signInSoftPreview = craftSoftFailOn(signInSoftFailParam);
  const clerkReady = clerkEnabled();
  const [apiSoft, setApiSoft] = useState(false);
  /** Child WeChat SoftFail ownership — sheet SoftFail yields while open. */
  const [wechatOwnsSoft, setWechatOwnsSoft] = useState(false);
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void fetchHealth()
      .then(() => {
        if (!cancelled) setApiSoft(false);
      })
      .catch(() => {
        if (!cancelled) setApiSoft(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [rise, clerkReady, apiSoft, signInSoftPreview]);

  /**
   * SoftFail owned by sign-in sheet — never timber / Failed to fetch.
   * Craft `?signInSoftFail=1` forces SoftFail depth without a Clerk/API miss.
   */
  const softCopy = signInSoftPreview
    ? t(locale, "auth.signInSoftFail")
    : !clerkReady
      ? t(locale, "auth.signInSoftFail")
      : apiSoft
        ? t(locale, "auth.signInApiSoftFail")
        : null;
  const softOpen = Boolean(softCopy);
  /** Parent SoftFail yields while WeChat child SoftFail owns (no double depth). */
  const sheetSoftOpen = softOpen && !wechatOwnsSoft;
  const railSoft = softOpen || wechatOwnsSoft;

  const brandName = locale === "zh-CN" ? brand.zh : brand.en;

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
          title: t(locale, "nav.signIn"),
          headerStyle: { backgroundColor: colors.foam },
          headerTintColor: colors.ink,
        }}
      />
      <View style={styles.sky} pointerEvents="none" />
      <View style={styles.skyOrb} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={StyleSheet.flatten([styles.header, riseStyle])}>
          <Text style={styles.eyebrow}>
            {t(locale, "auth.eyebrow")} · {brandName}
          </Text>
          <Text style={styles.title}>{t(locale, "nav.signIn")}</Text>
          <Text style={styles.support}>{t(locale, "auth.support")}</Text>
        </Animated.View>

        {/*
          SoftFail helper adoption (BEA-392) + craft SoftFail query parity
          (BEA-421): SoftFailBadge · SoftFailSupport · softFailMistWashStyle ·
          WeChat SoftFail yield. Craft: ?signInSoftFail=1 — never timber.
        */}
        <SheetPresence
          open
          delayMs={60}
          rise={18}
          style={styles.sheet}
          accessibilityLabel={t(locale, "nav.signIn")}
        >
          <View
            style={StyleSheet.flatten([
              styles.sheetRail,
              railSoft ? styles.sheetRailSoft : null,
            ])}
          >
            <View style={styles.sheetRailCopy}>
              <Text style={styles.sheetEyebrow}>
                {t(locale, "auth.sheetEyebrow")}
              </Text>
              {railSoft ? (
                <SoftFailSupport>
                  {t(locale, "auth.softSupport")}
                </SoftFailSupport>
              ) : (
                <Text style={styles.sheetSupport}>
                  {t(locale, "auth.sheetSupport")}
                </Text>
              )}
            </View>
            {railSoft ? (
              <SoftFailBadge>{t(locale, "auth.signInSoftBadge")}</SoftFailBadge>
            ) : (
              <SoftFailLiveBadge>
                {t(locale, "auth.liveBadge")}
              </SoftFailLiveBadge>
            )}
          </View>

          {/* Compact SoftFail under azure rail — yields while WeChat child owns. */}
          <SoftFailNotice open={sheetSoftOpen} compact>
            {softCopy ?? ""}
          </SoftFailNotice>

          <SheetPresence
            open
            delayMs={40}
            rise={10}
            style={StyleSheet.flatten([
              styles.sheetBody,
              sheetSoftOpen ? softFailMistWashStyle : null,
            ])}
            accessibilityLabel={
              clerkReady
                ? t(locale, "auth.providersEyebrow")
                : t(locale, "auth.demoTitle")
            }
          >
            {clerkReady ? (
              <ClerkProviders onWechatSoftFailChange={setWechatOwnsSoft} />
            ) : (
              <DemoAuthSheet soft={sheetSoftOpen} />
            )}
          </SheetPresence>
        </SheetPresence>
      </ScrollView>
    </View>
  );
}

function ClerkProviders({
  onWechatSoftFailChange,
}: {
  onWechatSoftFailChange: (owns: boolean) => void;
}) {
  const wechat = wechatLoginEnabled();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      router.replace("/trips");
    }
  }, [isSignedIn]);

  return (
    <View style={styles.providersBody}>
      <Text style={styles.providersEyebrow}>
        {t(locale, "auth.providersEyebrow")}
      </Text>
      <Text style={styles.providersTitle}>{t(locale, "auth.providersTitle")}</Text>
      <Text style={styles.providersCopy}>{t(locale, "auth.providers")}</Text>
      {wechat ? (
        <Text style={styles.wechatReady}>{t(locale, "auth.wechatReady")}</Text>
      ) : (
        <Text style={styles.providersCopy}>{t(locale, "auth.wechatHint")}</Text>
      )}
      {wechat ? (
        <WeChatButton onSoftFailChange={onWechatSoftFailChange} />
      ) : null}
      <Link href="/trips" asChild>
        <Pressable
          style={styles.linkRow}
          accessibilityRole="link"
        >
          <Text style={styles.linkLabel}>← {t(locale, "nav.trips")}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function DemoAuthSheet({ soft }: { soft?: boolean }) {
  return (
    <View
      style={StyleSheet.flatten([
        styles.demoInset,
        soft ? styles.demoInsetSoft : null,
      ])}
      accessibilityLabel={t(locale, "auth.demoTitle")}
    >
      <Text style={styles.setupEyebrow}>{t(locale, "auth.setupEyebrow")}</Text>
      <Text style={styles.demoTitle}>{t(locale, "auth.demoTitle")}</Text>
      <Text style={styles.demoBody}>{t(locale, "auth.demoBody")}</Text>
      <View style={styles.steps}>
        <Text style={styles.step}>1. {t(locale, "auth.demoStep1")}</Text>
        <Text style={styles.step}>2. {t(locale, "mobile.signInExpoHint")}</Text>
        <Text style={styles.step}>3. {t(locale, "auth.demoStep3")}</Text>
      </View>
      <Link href="/trips/sample-kyoto" asChild>
        <Pressable style={styles.cta} accessibilityRole="button">
          <Text style={styles.ctaLabel}>{t(locale, "trips.openSample")}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function WeChatButton({
  onSoftFailChange,
}: {
  /** Parent SoftFail yields while this SoftFail is open. */
  onSoftFailChange?: (owns: boolean) => void;
}) {
  const { startOAuthFlow } = useOAuth({ strategy: WECHAT_STRATEGY });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSoftFailChange?.(failed);
    return () => {
      onSoftFailChange?.(false);
    };
  }, [failed, onSoftFailChange]);

  const onPress = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { createdSessionId, setActive } = await startOAuthFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/trips");
      }
    } catch {
      // SoftFailNotice — never timber / raw Error.message
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [startOAuthFlow]);

  return (
    <View style={styles.wechatBlock}>
      <Pressable
        style={StyleSheet.flatten([
          styles.cta,
          busy ? styles.ctaDisabled : null,
        ])}
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={colors.foam} />
        ) : (
          <Text style={styles.ctaLabel}>{t(locale, "auth.wechat")}</Text>
        )}
      </Pressable>
      {/* Child SoftFail — sign-in sheet SoftFail yields while open. */}
      <SoftFailNotice open={failed} compact style={styles.wechatSoftFail}>
        {t(locale, "auth.wechatStartFailed")}
      </SoftFailNotice>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  sky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: "rgba(219, 232, 255, 0.55)",
  },
  skyOrb: {
    position: "absolute",
    top: -48,
    right: -24,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(47, 107, 255, 0.14)",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    marginBottom: 16,
  },
  eyebrow: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.8,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 12,
  },
  title: {
    ...type.display,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -0.9,
    color: colors.ink,
  },
  support: {
    ...type.body,
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    maxWidth: 420,
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
  sheetRailSoft: {
    backgroundColor: "rgba(244, 246, 250, 0.85)",
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
  /** Mist SoftFail strip under azure rail — border-b before mist body. */
  sheetSoftFail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderTopWidth: 0,
  },
  statusBadge: {
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeSoft: {
    backgroundColor: colors.mist,
  },
  statusBadgeLive: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  statusBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  statusBadgeTextSoft: {
    color: colors.inkSoft,
  },
  statusBadgeTextLive: {
    color: colors.river,
  },
  sheetBody: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
    backgroundColor: "rgba(230, 236, 245, 0.18)",
  },
  /** Mist wash on tip-011 body while SoftFail owns the rail. */
  sheetBodySoft: {
    backgroundColor: "rgba(230, 236, 245, 0.32)",
  },
  providersBody: {
    gap: 12,
  },
  providersEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  providersTitle: {
    ...type.display,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  providersCopy: {
    ...type.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  wechatReady: {
    ...type.body,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    color: colors.river,
  },
  wechatBlock: {
    gap: 10,
    marginTop: 4,
  },
  wechatSoftFail: {
    borderTopWidth: 0,
  },
  demoInset: {
    gap: 14,
    overflow: "hidden",
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.42)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  demoInsetSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.55)",
  },
  setupEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  demoTitle: {
    ...type.display,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  demoBody: {
    ...type.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  steps: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 14,
    gap: 10,
  },
  step: {
    ...type.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  cta: {
    alignSelf: "flex-start",
    backgroundColor: colors.river,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    paddingVertical: 13,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.river,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 15,
    fontWeight: "700",
  },
  linkRow: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  linkLabel: {
    ...type.body,
    fontSize: 14,
    fontWeight: "600",
    color: colors.river,
  },
});
