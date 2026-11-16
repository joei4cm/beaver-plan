import { Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";

const locale = "zh-CN" as const;

export default function TripsScreen() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t(locale, "trips.title") }} />
      <Text style={styles.title}>{t(locale, "trips.title")}</Text>
      <Text style={styles.body}>{t(locale, "trips.empty")}</Text>
      <View style={styles.sample}>
        <Text style={styles.sampleTitle}>{t(locale, "trips.placeholder.kyoto")}</Text>
        <Text style={styles.sampleMeta}>{t(locale, "trips.placeholder.kyotoMeta")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.paper,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    marginBottom: 28,
  },
  sample: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 20,
  },
  sampleTitle: {
    fontSize: 20,
    color: colors.ink,
    fontWeight: "500",
  },
  sampleMeta: {
    marginTop: 6,
    fontSize: 13,
    color: colors.inkSoft,
  },
});
