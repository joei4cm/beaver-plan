import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { brand, colors, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { wechatLoginEnabled } from "../src/clerk";

const locale = "zh-CN" as const;

export default function HomeScreen() {
  const wechat = wechatLoginEnabled();
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.hero}>
        <View style={styles.heroWash} />
        <Text style={styles.eyebrow}>{brand.en}</Text>
        <Text style={styles.brand}>{t(locale, "mobile.splash")}</Text>
        <Text style={styles.tagline}>{t(locale, "mobile.homeTagline")}</Text>
        <Text style={styles.hint}>{t(locale, "mobile.homeHint")}</Text>
      </View>
      <View style={styles.actions}>
        <Link href="/trips/sample-kyoto" asChild>
          <Pressable style={styles.primary}>
            <Text style={styles.primaryLabel}>{t(locale, "mobile.viewMap")}</Text>
          </Pressable>
        </Link>
        <Link href="/translate" asChild>
          <Pressable style={styles.translate}>
            <Text style={styles.primaryLabel}>{t(locale, "mobile.translate")}</Text>
          </Pressable>
        </Link>
        <Link href="/sign-in" asChild>
          <Pressable style={styles.secondary}>
            <Text style={styles.secondaryLabel}>
              {wechat ? t(locale, "auth.wechat") : t(locale, "nav.signIn")}
            </Text>
          </Pressable>
        </Link>
        <Link href="/trips" asChild>
          <Pressable style={styles.ghost}>
            <Text style={styles.ghostLabel}>{t(locale, "cta.viewTrips")}</Text>
          </Pressable>
        </Link>
      </View>
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
    paddingBottom: 36,
    backgroundColor: colors.riverDeep,
    overflow: "hidden",
  },
  heroWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    borderBottomWidth: 160,
    borderBottomColor: "rgba(12, 124, 120, 0.28)",
  },
  eyebrow: {
    color: "rgba(250, 251, 252, 0.55)",
    letterSpacing: 3.6,
    textTransform: "uppercase",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 16,
  },
  brand: {
    color: colors.foam,
    fontSize: 52,
    fontWeight: "800",
    letterSpacing: -1.2,
    lineHeight: 56,
  },
  tagline: {
    marginTop: 16,
    color: "rgba(250, 251, 252, 0.92)",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "500",
    maxWidth: 300,
  },
  hint: {
    marginTop: 10,
    color: "rgba(250, 251, 252, 0.62)",
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 300,
  },
  actions: {
    padding: 24,
    paddingTop: 22,
    backgroundColor: colors.paper,
    gap: 0,
  },
  primary: {
    backgroundColor: colors.timber,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  translate: {
    marginTop: 10,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryLabel: {
    color: colors.foam,
    fontSize: 15,
    fontWeight: "700",
  },
  secondary: {
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: colors.foam,
  },
  secondaryLabel: {
    color: colors.inkSoft,
    fontSize: 15,
    fontWeight: "600",
  },
  ghost: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostLabel: {
    color: colors.river,
    fontSize: 14,
    fontWeight: "600",
  },
});
