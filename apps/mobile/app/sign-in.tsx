import { useOAuth, useAuth } from "@clerk/clerk-expo";
import type { OAuthStrategy } from "@clerk/types";
import { Link, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { brand, colors } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { clerkEnabled, wechatLoginEnabled } from "../src/clerk";

WebBrowser.maybeCompleteAuthSession();

const locale = "zh-CN" as const;
/** Clerk Dashboard WeChat social connection — not in published OAuthProvider union yet. */
const WECHAT_STRATEGY = "oauth_wechat" as OAuthStrategy;

/** Soft gate: demo copy without keys; Clerk/WeChat when publishable key is set. */
export default function SignInScreen() {
  if (!clerkEnabled()) {
    return <DemoSignIn />;
  }
  return <ClerkSignIn />;
}

function DemoSignIn() {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{brand.en}</Text>
        <Text style={styles.title}>{t(locale, "auth.demoTitle")}</Text>
        <Text style={styles.body}>{t(locale, "auth.demoBody")}</Text>
        <Text style={styles.step}>{t(locale, "auth.demoStep1")}</Text>
        <Text style={styles.step}>{t(locale, "mobile.signInExpoHint")}</Text>
      </View>
      <View style={styles.actions}>
        <Link href="/trips/sample-kyoto" asChild>
          <Pressable style={styles.primary}>
            <Text style={styles.primaryLabel}>{t(locale, "mobile.viewMap")}</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

function ClerkSignIn() {
  const wechat = wechatLoginEnabled();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      router.replace("/trips");
    }
  }, [isSignedIn]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{brand.en}</Text>
        <Text style={styles.title}>{t(locale, "nav.signIn")}</Text>
        <Text style={styles.body}>{t(locale, "auth.support")}</Text>
        {wechat ? (
          <Text style={styles.wechatReady}>{t(locale, "auth.wechatReady")}</Text>
        ) : (
          <Text style={styles.body}>{t(locale, "auth.wechatHint")}</Text>
        )}
      </View>
      <View style={styles.actions}>
        {wechat ? <WeChatButton /> : null}
        <Link href="/trips" asChild>
          <Pressable style={styles.secondary}>
            <Text style={styles.secondaryLabel}>{t(locale, "cta.viewTrips")}</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

function WeChatButton() {
  const { startOAuthFlow } = useOAuth({ strategy: WECHAT_STRATEGY });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId, setActive } = await startOAuthFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/trips");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t(locale, "auth.wechatStartFailed"),
      );
    } finally {
      setBusy(false);
    }
  }, [startOAuthFlow]);

  return (
    <>
      <Pressable
        style={[styles.primary, busy && styles.disabled]}
        onPress={onPress}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.foam} />
        ) : (
          <Text style={styles.primaryLabel}>{t(locale, "auth.wechat")}</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: colors.riverDeep,
  },
  eyebrow: {
    color: "rgba(247, 250, 248, 0.65)",
    letterSpacing: 3,
    textTransform: "uppercase",
    fontSize: 12,
    marginBottom: 12,
  },
  title: {
    color: colors.foam,
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  body: {
    marginTop: 14,
    color: "rgba(247, 250, 248, 0.82)",
    fontSize: 15,
    lineHeight: 22,
  },
  wechatReady: {
    marginTop: 14,
    color: colors.foam,
    fontSize: 15,
    lineHeight: 22,
  },
  step: {
    marginTop: 8,
    color: "rgba(247, 250, 248, 0.7)",
    fontSize: 13,
    lineHeight: 20,
  },
  actions: {
    padding: 24,
    backgroundColor: colors.paper,
    gap: 10,
  },
  primary: {
    backgroundColor: colors.river,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.7,
  },
  primaryLabel: {
    color: colors.foam,
    fontSize: 15,
    fontWeight: "600",
  },
  secondary: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.foam,
  },
  secondaryLabel: {
    color: colors.inkSoft,
    fontSize: 15,
    fontWeight: "600",
  },
  error: {
    marginTop: 4,
    color: "#b42318",
    fontSize: 13,
  },
});
