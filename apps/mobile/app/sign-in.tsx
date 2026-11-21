import { useOAuth, useAuth } from "@clerk/clerk-expo";
import type { OAuthStrategy } from "@clerk/types";
import { Link, Stack, router } from "expo-router";
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
import { SoftFailNotice } from "../src/components/soft-fail-notice";
import { clerkEnabled, wechatLoginEnabled } from "../src/clerk";
import { type } from "../src/theme";

WebBrowser.maybeCompleteAuthSession();

const locale = "zh-CN" as const;
/** Clerk Dashboard WeChat social connection — not in published OAuthProvider union yet. */
const WECHAT_STRATEGY = "oauth_wechat" as OAuthStrategy;
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Lumen Route Expo sign-in after web #115: paper + azure wash · river eyebrow ·
 * SoftFailNotice (demo / soft offline / WeChat fail) · never timber · StyleSheet.flatten (#46).
 */
export default function SignInScreen() {
  const clerkReady = clerkEnabled();
  const [apiSoft, setApiSoft] = useState(false);
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
  }, [rise, clerkReady, apiSoft]);

  const softCopy = !clerkReady
    ? t(locale, "auth.demoNotice")
    : apiSoft
      ? t(locale, "auth.softOffline")
      : null;

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

        <SoftFailNotice
          open={Boolean(softCopy)}
          style={styles.softNotice}
        >
          {softCopy ?? ""}
        </SoftFailNotice>

        <Animated.View
          style={StyleSheet.flatten([
            styles.stage,
            {
              opacity: rise,
              transform: [
                {
                  translateY: rise.interpolate({
                    inputRange: [0, 1],
                    outputRange: [22, 0],
                  }),
                },
              ],
            },
          ])}
        >
          {clerkReady ? (
            <ClerkProviders />
          ) : (
            <DemoAuthSheet />
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function ClerkProviders() {
  const wechat = wechatLoginEnabled();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      router.replace("/trips");
    }
  }, [isSignedIn]);

  return (
    <View style={styles.providers}>
      <View style={styles.providersHeader}>
        <Text style={styles.sheetEyebrow}>
          {t(locale, "auth.providersEyebrow")}
        </Text>
      </View>
      <View style={styles.providersBody}>
        <Text style={styles.providersTitle}>{t(locale, "nav.signIn")}</Text>
        <Text style={styles.providersCopy}>{t(locale, "auth.providers")}</Text>
        {wechat ? (
          <Text style={styles.wechatReady}>{t(locale, "auth.wechatReady")}</Text>
        ) : (
          <Text style={styles.providersCopy}>{t(locale, "auth.wechatHint")}</Text>
        )}
        {wechat ? <WeChatButton /> : null}
        <Link href="/trips" asChild>
          <Pressable
            style={styles.linkRow}
            accessibilityRole="link"
          >
            <Text style={styles.linkLabel}>← {t(locale, "nav.trips")}</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

function DemoAuthSheet() {
  return (
    <View
      style={styles.sheet}
      accessibilityLabel={t(locale, "auth.demoTitle")}
    >
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetEyebrow}>
          {t(locale, "auth.setupEyebrow")}
        </Text>
      </View>
      <View style={styles.sheetBody}>
        <Text style={styles.demoTitle}>{t(locale, "auth.demoTitle")}</Text>
        <Text style={styles.demoBody}>{t(locale, "auth.demoBody")}</Text>
        <View style={styles.steps}>
          <Text style={styles.step}>1. {t(locale, "auth.demoStep1")}</Text>
          <Text style={styles.step}>2. {t(locale, "mobile.signInExpoHint")}</Text>
          <Text style={styles.step}>3. {t(locale, "auth.demoStep3")}</Text>
        </View>
        <Link href="/trips/sample-kyoto" asChild>
          <Pressable
            style={styles.cta}
            accessibilityRole="button"
          >
            <Text style={styles.ctaLabel}>{t(locale, "trips.openSample")}</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

function WeChatButton() {
  const { startOAuthFlow } = useOAuth({ strategy: WECHAT_STRATEGY });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

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
      <SoftFailNotice open={failed} compact>
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
    marginBottom: 8,
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
  softNotice: {
    marginTop: 20,
    marginBottom: 8,
  },
  stage: {
    marginTop: 16,
  },
  providers: {
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
  providersHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  providersBody: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 12,
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
  sheet: {
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
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  sheetBody: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
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
