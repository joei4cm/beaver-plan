import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { brand, colors } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";

const locale = "zh-CN" as const;

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{brand.en}</Text>
        <Text style={styles.brand}>{t(locale, "mobile.splash")}</Text>
        <Text style={styles.hint}>{t(locale, "mobile.homeHint")}</Text>
      </View>
      <View style={styles.actions}>
        <Link href="/trips" asChild>
          <Pressable style={styles.primary}>
            <Text style={styles.primaryLabel}>{t(locale, "cta.viewTrips")}</Text>
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
  },
  eyebrow: {
    color: "rgba(247, 250, 248, 0.65)",
    letterSpacing: 3,
    textTransform: "uppercase",
    fontSize: 12,
    marginBottom: 12,
  },
  brand: {
    color: colors.foam,
    fontSize: 44,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  hint: {
    marginTop: 16,
    color: "rgba(247, 250, 248, 0.82)",
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 280,
  },
  actions: {
    padding: 24,
    backgroundColor: colors.paper,
  },
  primary: {
    backgroundColor: colors.river,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: colors.foam,
    fontSize: 15,
    fontWeight: "600",
  },
});
