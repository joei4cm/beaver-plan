import { useEffect, useRef } from "react";
import { Link, Stack } from "expo-router";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { brand, colors, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { wechatLoginEnabled } from "../src/clerk";
import { type } from "../src/theme";

const locale = "zh-CN" as const;

export default function HomeScreen() {
  const wechat = wechatLoginEnabled();
  const rise = useRef(new Animated.Value(0)).current;
  const route = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rise, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(route, {
        toValue: 1,
        duration: 900,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [rise, route]);

  const riseStyle = {
    opacity: rise,
    transform: [
      {
        translateY: rise.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.hero}>
        <View style={styles.skyA} pointerEvents="none" />
        <View style={styles.skyB} pointerEvents="none" />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.routeLayer,
            {
              opacity: route.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
            },
          ]}
        >
          <View style={[styles.routeDot, styles.dot1]} />
          <View style={[styles.routeDot, styles.dot2]} />
          <View style={[styles.routeDot, styles.dot3]} />
          <View style={[styles.routeDot, styles.dotEnd]} />
          <View style={styles.routeArc} />
        </Animated.View>

        <Animated.View style={[styles.heroCopy, riseStyle]}>
          <Text style={styles.brandEn}>{brand.en}</Text>
          <Text style={styles.brandZh}>{t(locale, "mobile.splash")}</Text>
          <Text style={styles.tagline}>{t(locale, "mobile.homeTagline")}</Text>
          <Text style={styles.support}>{t(locale, "landing.support")}</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.actions, riseStyle]}>
        <Link href="/trips" asChild>
          <Pressable style={styles.primary}>
            <Text style={styles.primaryLabel}>
              {t(locale, "cta.startPlanning")}
            </Text>
          </Pressable>
        </Link>
        <Link href="/translate" asChild>
          <Pressable style={styles.secondary}>
            <Text style={styles.secondaryLabel}>
              {t(locale, "nav.translate")}
            </Text>
          </Pressable>
        </Link>
        <Link href="/sign-in" asChild>
          <Pressable style={styles.ghost}>
            <Text style={styles.ghostLabel}>
              {wechat ? t(locale, "auth.wechat") : t(locale, "nav.signIn")}
            </Text>
          </Pressable>
        </Link>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  hero: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 28,
    paddingBottom: 28,
    overflow: "hidden",
    backgroundColor: "#DBE8FF",
  },
  skyA: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    // Soft luminous wash — sky → paper (not purple / cream / atlas)
    borderBottomWidth: 220,
    borderBottomColor: "rgba(47, 107, 255, 0.14)",
  },
  skyB: {
    position: "absolute",
    top: -40,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(96, 165, 250, 0.22)",
  },
  routeLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  routeArc: {
    position: "absolute",
    left: "8%",
    right: "6%",
    top: "42%",
    height: 2,
    backgroundColor: "rgba(47, 107, 255, 0.35)",
    transform: [{ rotate: "-12deg" }],
  },
  routeDot: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.river,
    borderWidth: 3,
    borderColor: colors.foam,
  },
  dot1: { top: "48%", left: "18%" },
  dot2: { top: "40%", left: "42%" },
  dot3: { top: "34%", left: "64%" },
  dotEnd: {
    top: "28%",
    left: "82%",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.ink,
  },
  heroCopy: {
    maxWidth: 360,
    zIndex: 1,
  },
  brandEn: {
    ...type.display,
    color: colors.river,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  brandZh: {
    ...type.display,
    color: colors.ink,
    fontSize: 52,
    fontWeight: "800",
    letterSpacing: -1.6,
    lineHeight: 56,
  },
  tagline: {
    ...type.display,
    marginTop: 18,
    color: colors.ink,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.3,
    maxWidth: 300,
  },
  support: {
    ...type.body,
    marginTop: 12,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 300,
  },
  actions: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: colors.paper,
    gap: 10,
  },
  primary: {
    backgroundColor: colors.river,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 15,
    fontWeight: "700",
  },
  secondary: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.12)",
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: colors.foam,
  },
  secondaryLabel: {
    ...type.body,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  ghost: {
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostLabel: {
    ...type.body,
    color: colors.river,
    fontSize: 14,
    fontWeight: "600",
  },
});
