import { Link, Stack } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";

const locale = "zh-CN" as const;

export default function TripsScreen() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t(locale, "trips.title") }} />
      <Text style={styles.brand}>Beaver Plan · 海狸旅行</Text>
      <Text style={styles.title}>{t(locale, "trips.title")}</Text>
      <Text style={styles.body}>{t(locale, "trips.empty")}</Text>
      <Link href="/trips/sample-kyoto" asChild>
        <Pressable style={styles.sample}>
          <Text style={styles.index}>01</Text>
          <View style={styles.sampleBody}>
            <Text style={styles.sampleTitle}>
              {t(locale, "trips.placeholder.kyoto")}
            </Text>
            <Text style={styles.sampleMeta}>
              {t(locale, "trips.placeholder.kyotoMeta")}
            </Text>
            <Text style={styles.cta}>{t(locale, "mobile.viewMap")} →</Text>
          </View>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.paper,
  },
  brand: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.ink,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    marginBottom: 28,
  },
  sample: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 22,
  },
  index: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.mist,
    letterSpacing: -0.5,
  },
  sampleBody: {
    flex: 1,
  },
  sampleTitle: {
    fontSize: 22,
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  sampleMeta: {
    marginTop: 6,
    fontSize: 13,
    color: colors.inkSoft,
  },
  cta: {
    marginTop: 14,
    fontSize: 14,
    color: colors.timber,
    fontWeight: "700",
  },
});
