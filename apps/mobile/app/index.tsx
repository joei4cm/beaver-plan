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
          <Pressable style={styles.secondary}>
            <Text style={styles.secondaryLabel}>{t(locale, "cta.viewTrips")}</Text>
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
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: colors.riverDeep,
    overflow: "hidden",
  },
  heroWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    borderBottomWidth: 120,
    borderBottomColor: "rgba(26, 101, 87, 0.35)",
  },
  eyebrow: {
    color: "rgba(248, 250, 248, 0.62)",
    letterSpacing: 3.2,
    textTransform: "uppercase",
    fontSize: 12,
    marginBottom: 14,
  },
  brand: {
    color: colors.foam,
    fontSize: 46,
    fontWeight: "600",
    letterSpacing: -0.6,
  },
  tagline: {
    marginTop: 14,
    color: "rgba(248, 250, 248, 0.92)",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "500",
    maxWidth: 300,
  },
  hint: {
    marginTop: 12,
    color: "rgba(248, 250, 248, 0.72)",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 300,
  },
  actions: {
    padding: 24,
    paddingTop: 20,
    backgroundColor: colors.paper,
    gap: 0,
  },
  primary: {
    backgroundColor: colors.river,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
  },
  translate: {
    marginTop: 10,
    backgroundColor: colors.riverDeep,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryLabel: {
    color: colors.foam,
    fontSize: 15,
    fontWeight: "600",
  },
  secondary: {
    marginTop: 10,
    borderRadius: radius.md,
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
});
