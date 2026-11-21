import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Stack, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CITY_TEMPLATES,
  sampleKyotoFixture,
  type CityTemplate,
  type Trip,
} from "@beaver/core";
import { colors, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import {
  createTripFromTemplate,
  isApiSoftFail,
  listTemplates,
  listTrips,
  type MobileTemplateCard,
} from "../src/api";
import { type } from "../src/theme";

const locale = "zh-CN" as const;

function templateCardsFromSeed(): MobileTemplateCard[] {
  return CITY_TEMPLATES.map((tpl: CityTemplate) => ({
    id: tpl.id,
    title: tpl.title,
    destination: tpl.destination,
    description: tpl.description,
    dayCount: tpl.days.length,
    stopCount: tpl.days.reduce((n, d) => n + d.stops.length, 0),
  }));
}

function sampleTripStub(): Trip {
  return sampleKyotoFixture().trip;
}

function formatTripMeta(trip: Trip): string {
  const parts: string[] = [];
  if (trip.destination) parts.push(trip.destination);
  if (trip.startDate) {
    const range =
      trip.endDate && trip.endDate !== trip.startDate
        ? `${trip.startDate} → ${trip.endDate}`
        : trip.startDate;
    parts.push(range);
  }
  if (trip.id === "sample-kyoto") {
    parts.push(t(locale, "trips.sampleBadge"));
  }
  return parts.join(" · ") || "—";
}

export default function TripsScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [templates, setTemplates] = useState<MobileTemplateCard[]>(() =>
    templateCardsFromSeed(),
  );
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    let remoteFailed = false;
    let remoteTrips: Trip[] | null = null;

    try {
      const tplRes = await listTemplates();
      if (tplRes.templates?.length) setTemplates(tplRes.templates);
    } catch {
      setTemplates(templateCardsFromSeed());
    }

    try {
      const tripRes = await listTrips();
      remoteTrips = tripRes.trips;
    } catch (e) {
      remoteFailed = true;
      if (!isApiSoftFail(e)) {
        setError(e instanceof Error ? e.message : "load_failed");
      }
    }

    const byId = new Map<string, Trip>();
    for (const trip of remoteTrips ?? []) byId.set(trip.id, trip);
    if (remoteFailed || !byId.has("sample-kyoto")) {
      byId.set("sample-kyoto", sampleTripStub());
    }
    setTrips(
      Array.from(byId.values()).sort((a, b) => {
        if (a.id === "sample-kyoto") return 1;
        if (b.id === "sample-kyoto") return -1;
        return b.updatedAt.localeCompare(a.updatedAt);
      }),
    );

    if (remoteFailed) {
      setSoftNotice(t(locale, "trips.softOffline"));
      setError(null);
    } else {
      setSoftNotice(null);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function useTemplate(id: string) {
    setCreatingId(id);
    setError(null);
    try {
      const res = await createTripFromTemplate(id);
      router.push(`/trips/${res.trip.id}`);
    } catch (e) {
      if (isApiSoftFail(e)) {
        setSoftNotice(t(locale, "trips.softOffline"));
        setError(null);
        router.push("/trips/sample-kyoto");
        return;
      }
      setError(e instanceof Error ? e.message : "create_failed");
      setCreatingId(null);
    }
  }

  const ownTrips = useMemo(
    () => trips.filter((x) => x.id !== "sample-kyoto"),
    [trips],
  );
  const showEmptyInvite = hydrated && ownTrips.length === 0;
  const sampleTrips = trips.filter((x) => x.id === "sample-kyoto");

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen
        options={{
          title: t(locale, "trips.title"),
          headerStyle: { backgroundColor: colors.foam },
          headerTintColor: colors.ink,
        }}
      />

      <View style={styles.topo} pointerEvents="none" />

      <View style={styles.hero}>
        <Text style={styles.brand}>Beaver Plan · 海狸旅行</Text>
        <Text style={styles.title}>{t(locale, "trips.title")}</Text>
        <Text style={styles.body}>{t(locale, "trips.support")}</Text>
        <View style={styles.ctaRow}>
          <Link href="/trips/sample-kyoto" asChild>
            <Pressable style={styles.primaryCta}>
              <Text style={styles.primaryCtaText}>
                {t(locale, "trips.openSample")}
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {!error && softNotice ? (
        <View style={styles.softBanner}>
          <Text style={styles.softText}>{softNotice}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t(locale, "trips.yours")}</Text>
        <Text style={styles.sectionSupport}>
          {t(locale, "trips.yoursSupport")}
        </Text>

        {!hydrated ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.river} />
            <Text style={styles.loadingText}>{t(locale, "trips.loading")}</Text>
          </View>
        ) : showEmptyInvite ? (
          <View style={styles.emptyInvite}>
            <Text style={styles.emptyTitle}>{t(locale, "trips.empty")}</Text>
            <Text style={styles.emptyBody}>{t(locale, "trips.emptyCta")}</Text>
            <View style={styles.emptyActions}>
              <Link href="/trips/sample-kyoto" asChild>
                <Pressable style={styles.primaryCta}>
                  <Text style={styles.primaryCtaText}>
                    {t(locale, "trips.openSample")}
                  </Text>
                </Pressable>
              </Link>
            </View>
            {sampleTrips.map((trip, index) => (
              <Link key={trip.id} href={`/trips/${trip.id}`} asChild>
                <Pressable style={styles.row}>
                  <Text style={styles.index}>
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{trip.title}</Text>
                    <Text style={styles.rowMeta}>{formatTripMeta(trip)}</Text>
                  </View>
                </Pressable>
              </Link>
            ))}
          </View>
        ) : (
          trips.map((trip, index) => (
            <Link key={trip.id} href={`/trips/${trip.id}`} asChild>
              <Pressable style={styles.row}>
                <Text style={styles.index}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{trip.title}</Text>
                  <Text style={styles.rowMeta}>{formatTripMeta(trip)}</Text>
                  <Text style={styles.rowCta}>{t(locale, "mobile.viewMap")} →</Text>
                </View>
              </Pressable>
            </Link>
          ))
        )}
      </View>

      <View style={[styles.section, styles.sectionSpaced]}>
        <Text style={styles.sectionTitle}>{t(locale, "trips.templates")}</Text>
        <Text style={styles.sectionSupport}>
          {t(locale, "trips.templatesSupport")}
        </Text>

        {templates.map((tpl, index) => {
          const title = tpl.title[locale] ?? tpl.title["zh-CN"];
          const desc = tpl.description[locale] ?? tpl.description["zh-CN"];
          const busy = creatingId === tpl.id;
          return (
            <View key={tpl.id} style={styles.templateRow}>
              <Text style={styles.index}>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <View style={styles.rowBody}>
                <View style={styles.accentBar} />
                <Text style={styles.templateTitle}>{title}</Text>
                <Text style={styles.rowMeta}>{desc}</Text>
                <Text style={styles.templateStats}>
                  {tpl.destination} · {tpl.dayCount}{" "}
                  {t(locale, "trips.dayUnit")} · {tpl.stopCount}{" "}
                  {t(locale, "trips.stopUnit")}
                </Text>
                <Pressable
                  style={[styles.useTpl, busy && styles.useTplBusy]}
                  disabled={busy || Boolean(creatingId)}
                  onPress={() => void useTemplate(tpl.id)}
                >
                  <Text style={styles.useTplText}>
                    {busy
                      ? t(locale, "trips.creating")
                      : t(locale, "trips.useTemplate")}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 48,
  },
  topo: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    opacity: 0.45,
    backgroundColor: "transparent",
    borderBottomWidth: 120,
    borderBottomColor: "rgba(219, 232, 255, 0.7)",
  },
  hero: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingBottom: 22,
    marginBottom: 8,
  },
  brand: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 12,
  },
  title: {
    ...type.display,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.ink,
    marginBottom: 10,
  },
  body: {
    ...type.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    marginBottom: 18,
    maxWidth: 360,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryCta: {
    backgroundColor: colors.river,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  primaryCtaText: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
  },
  softBanner: {
    marginTop: 16,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(47, 107, 255, 0.35)",
    backgroundColor: "rgba(230, 236, 245, 0.45)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  softText: {
    ...type.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  errorBanner: {
    marginTop: 16,
    borderLeftWidth: 2,
    borderLeftColor: colors.timber,
    backgroundColor: "rgba(225, 29, 72, 0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    ...type.body,
    fontSize: 13,
    color: colors.timber,
  },
  section: {
    marginTop: 28,
  },
  sectionSpaced: {
    marginTop: 40,
  },
  sectionTitle: {
    ...type.display,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: colors.ink,
    marginBottom: 6,
  },
  sectionSupport: {
    ...type.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
    marginBottom: 14,
    maxWidth: 360,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
  },
  loadingText: {
    ...type.body,
    color: colors.inkSoft,
    fontSize: 14,
  },
  emptyInvite: {
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "flex-start",
  },
  emptyTitle: {
    ...type.display,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  emptyBody: {
    ...type.body,
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
    maxWidth: 320,
    marginBottom: 18,
  },
  emptyActions: {
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 20,
    width: "100%",
  },
  templateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 20,
    marginTop: -StyleSheet.hairlineWidth,
  },
  index: {
    ...type.display,
    fontSize: 28,
    fontWeight: "800",
    color: colors.mist,
    letterSpacing: -0.5,
    minWidth: 40,
  },
  rowBody: {
    flex: 1,
  },
  accentBar: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.river,
    marginBottom: 10,
    opacity: 0.55,
  },
  rowTitle: {
    ...type.display,
    fontSize: 20,
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  templateTitle: {
    ...type.display,
    fontSize: 18,
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  rowMeta: {
    ...type.body,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  templateStats: {
    ...type.body,
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(47, 107, 255, 0.8)",
  },
  rowCta: {
    ...type.body,
    marginTop: 12,
    fontSize: 14,
    color: colors.river,
    fontWeight: "700",
  },
  useTpl: {
    alignSelf: "flex-start",
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.15)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.foam,
  },
  useTplBusy: {
    opacity: 0.45,
  },
  useTplText: {
    ...type.body,
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
});
