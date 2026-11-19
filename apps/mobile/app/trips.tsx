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
      <Text style={styles.body}>{t(locale, "trips.support")}</Text>

      <View style={styles.ctaRow}>
        <Link href="/trips/sample-kyoto" asChild>
          <Pressable style={styles.primaryCta}>
            <Text style={styles.primaryCtaText}>{t(locale, "trips.openSample")}</Text>
          </Pressable>
        </Link>
      </View>

      <Text style={styles.section}>{t(locale, "trips.yours")}</Text>
      <Text style={styles.empty}>{t(locale, "trips.empty")}</Text>
      <Text style={styles.emptyCta}>{t(locale, "trips.emptyCta")}</Text>

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

      <Text style={[styles.section, styles.sectionSpaced]}>
        {t(locale, "trips.templates")}
      </Text>
      <Text style={styles.templatesHint}>{t(locale, "trips.templatesSupport")}</Text>
      <View style={styles.templateRow}>
        <Text style={styles.index}>01</Text>
        <View style={styles.sampleBody}>
          <Text style={styles.templateTitle}>京都三日经典</Text>
          <Text style={styles.sampleMeta}>Kyoto · 3 days</Text>
        </View>
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
    marginBottom: 20,
  },
  ctaRow: {
    flexDirection: "row",
    marginBottom: 28,
  },
  primaryCta: {
    backgroundColor: colors.river,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryCtaText: {
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
  },
  section: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: colors.ink,
    marginBottom: 8,
  },
  sectionSpaced: {
    marginTop: 32,
  },
  empty: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 4,
  },
  emptyCta: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkSoft,
    marginBottom: 18,
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
  templateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 18,
    marginTop: 8,
  },
  templatesHint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
    marginBottom: 4,
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
  templateTitle: {
    fontSize: 18,
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
    color: colors.river,
    fontWeight: "700",
  },
});
