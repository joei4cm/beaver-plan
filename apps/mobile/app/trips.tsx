import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, Stack, useRouter } from "expo-router";
import {
  Animated,
  Easing,
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
import { colors, motion, radius } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import {
  createTripFromTemplate,
  isApiSoftFail,
  listTemplates,
  listTrips,
  type MobileTemplateCard,
} from "../src/api";
import { SoftFailNotice } from "../src/components/soft-fail-notice";
import { type } from "../src/theme";

const locale = "zh-CN" as const;

/** Tip 011 — shared rise easing from #46 motion tokens. */
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

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

function IndexMark({ n }: { n: number }) {
  return (
    <Text style={styles.index} accessibilityElementsHidden>
      {String(n).padStart(2, "0")}
    </Text>
  );
}

function TripRow({
  trip,
  index,
  showCta,
  last,
}: {
  trip: Trip;
  index: number;
  showCta?: boolean;
  last?: boolean;
}) {
  // Single style object — Link asChild + style arrays crash RN Web
  // (CSSStyleDeclaration indexed setter).
  const rowStyle = last
    ? StyleSheet.flatten([styles.row, styles.rowLast])
    : styles.row;

  return (
    <Link href={`/trips/${trip.id}`} asChild>
      <Pressable
        style={rowStyle}
        accessibilityRole="link"
        accessibilityLabel={`${trip.title}. ${formatTripMeta(trip)}`}
      >
        <IndexMark n={index + 1} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{trip.title}</Text>
          <Text style={styles.rowMeta}>{formatTripMeta(trip)}</Text>
          {showCta ? (
            <Text style={styles.rowCta}>
              {t(locale, "mobile.viewMap")} →
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

/** Tip 017 — soft-notice slot + rows while hydrating (web TripsListSkeleton parity). */
function TripsListSkeleton() {
  return (
    <View accessibilityState={{ busy: true }}>
      <View style={styles.skeletonNotice} />
      <View style={StyleSheet.flatten([styles.row, styles.rowLast])}>
        <View style={styles.skeletonIndex} />
        <View style={styles.rowBody}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonMeta} />
        </View>
      </View>
    </View>
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [templates, setTemplates] = useState<MobileTemplateCard[]>(() =>
    templateCardsFromSeed(),
  );
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [templatesSoft, setTemplatesSoft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const rise = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    let remoteFailed = false;
    let remoteTrips: Trip[] | null = null;

    try {
      const tplRes = await listTemplates();
      if (tplRes.templates?.length) {
        setTemplates(tplRes.templates);
        setTemplatesSoft(false);
      } else {
        setTemplates(templateCardsFromSeed());
        setTemplatesSoft(true);
      }
    } catch {
      setTemplates(templateCardsFromSeed());
      setTemplatesSoft(true);
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

  useEffect(() => {
    if (!hydrated) return;
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [hydrated, rise]);

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

  /** Mobile has no /trips/new form — solid New soft-creates via first playbook. */
  function startNewTrip() {
    const first = templates[0]?.id ?? "kyoto-3day";
    void useTemplate(first);
  }

  const ownTrips = useMemo(
    () => trips.filter((x) => x.id !== "sample-kyoto"),
    [trips],
  );
  const showEmptyInvite = hydrated && ownTrips.length === 0;
  const sampleTrips = trips.filter((x) => x.id === "sample-kyoto");

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

  const newBusy = Boolean(creatingId);

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

      <Animated.View style={riseStyle}>
        <View style={styles.hero}>
          <Text style={styles.brand}>Beaver Plan · 海狸旅行</Text>
          <Text style={styles.title}>{t(locale, "trips.title")}</Text>
          <Text style={styles.body}>{t(locale, "trips.support")}</Text>
          <View style={styles.ctaRow}>
            <Pressable
              style={StyleSheet.flatten([
                styles.solidCta,
                newBusy ? styles.ctaBusy : null,
              ])}
              disabled={newBusy}
              onPress={startNewTrip}
              accessibilityRole="button"
              accessibilityLabel={t(locale, "trips.new")}
            >
              <Text style={styles.solidCtaText}>{t(locale, "trips.new")}</Text>
            </Pressable>
            <Link href="/trips/sample-kyoto" asChild>
              <Pressable
                style={styles.outlineCta}
                accessibilityRole="link"
                accessibilityLabel={t(locale, "trips.openSample")}
              >
                <Text style={styles.outlineCtaText}>
                  {t(locale, "trips.openSample")}
                </Text>
              </Pressable>
            </Link>
            <Link href="/settings" asChild>
              <Pressable
                style={styles.ghostCta}
                accessibilityRole="link"
                accessibilityLabel={t(locale, "nav.settings")}
              >
                <Text style={styles.ghostCtaText}>
                  {t(locale, "nav.settings")}
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

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>
              {t(locale, "trips.yoursEyebrow")}
            </Text>
            <Text style={styles.sectionTitle}>
              {showEmptyInvite
                ? t(locale, "trips.empty")
                : t(locale, "trips.yours")}
            </Text>
            <Text style={styles.sectionSupport}>
              {showEmptyInvite
                ? t(locale, "trips.emptyCta")
                : t(locale, "trips.yoursSupport")}
            </Text>
          </View>

          <SoftFailNotice
            open={!error && Boolean(softNotice) && hydrated}
            style={styles.sectionSoftFail}
          >
            {softNotice ?? ""}
          </SoftFailNotice>

          {!hydrated ? (
            <TripsListSkeleton />
          ) : showEmptyInvite ? (
            <View>
              <View style={styles.emptyCtaRow}>
                <Pressable
                  style={StyleSheet.flatten([
                    styles.solidCta,
                    newBusy ? styles.ctaBusy : null,
                  ])}
                  disabled={newBusy}
                  onPress={startNewTrip}
                  accessibilityRole="button"
                  accessibilityLabel={t(locale, "trips.new")}
                >
                  <Text style={styles.solidCtaText}>
                    {t(locale, "trips.new")}
                  </Text>
                </Pressable>
                <Link href="/trips/sample-kyoto" asChild>
                  <Pressable
                    style={styles.outlineCta}
                    accessibilityRole="link"
                    accessibilityLabel={t(locale, "trips.openSample")}
                  >
                    <Text style={styles.outlineCtaText}>
                      {t(locale, "trips.openSample")}
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {sampleTrips.length > 0 ? (
                <View style={styles.sampleBlock}>
                  <Text style={styles.sampleEyebrow}>
                    {t(locale, "trips.sampleEyebrow")}
                  </Text>
                  {sampleTrips.map((trip, index) => (
                    <TripRow
                      key={trip.id}
                      trip={trip}
                      index={index}
                      showCta
                      last={index === sampleTrips.length - 1}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            trips.map((trip, index) => (
              <TripRow
                key={trip.id}
                trip={trip}
                index={index}
                showCta
                last={index === trips.length - 1}
              />
            ))
          )}
        </View>

        <View
          style={StyleSheet.flatten([styles.section, styles.sectionSpaced])}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>
              {t(locale, "trips.templatesEyebrow")}
            </Text>
            <Text style={styles.sectionTitle}>
              {t(locale, "trips.templates")}
            </Text>
            <Text style={styles.sectionSupport}>
              {t(locale, "trips.templatesSupport")}
            </Text>
          </View>

          <SoftFailNotice
            open={templatesSoft && hydrated}
            style={styles.sectionSoftFail}
          >
            {t(locale, "trips.templatesSoftOffline")}
          </SoftFailNotice>

          {templates.map((tpl, index) => {
            const title = tpl.title[locale] ?? tpl.title["zh-CN"];
            const desc = tpl.description[locale] ?? tpl.description["zh-CN"];
            const busy = creatingId === tpl.id;
            const last = index === templates.length - 1;
            const tplRowStyle = last
              ? StyleSheet.flatten([styles.templateRow, styles.rowLast])
              : styles.templateRow;
            const useStyle = busy
              ? StyleSheet.flatten([styles.useTpl, styles.useTplBusy])
              : styles.useTpl;
            return (
              <View key={tpl.id} style={tplRowStyle}>
                <IndexMark n={index + 1} />
                <View style={styles.rowBody}>
                  <Text style={styles.templateTitle}>{title}</Text>
                  <Text style={styles.rowMeta}>{desc}</Text>
                  <Text style={styles.templateStats}>
                    {tpl.destination} · {tpl.dayCount}{" "}
                    {t(locale, "trips.dayUnit")} · {tpl.stopCount}{" "}
                    {t(locale, "trips.stopUnit")}
                  </Text>
                  <Pressable
                    style={useStyle}
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
      </Animated.View>
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
  emptyCtaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  solidCta: {
    backgroundColor: colors.river,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  solidCtaText: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
  },
  outlineCta: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47, 107, 255, 0.35)",
    backgroundColor: colors.foam,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  outlineCtaText: {
    ...type.body,
    color: colors.river,
    fontSize: 14,
    fontWeight: "700",
  },
  ghostCta: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
  },
  ghostCtaText: {
    ...type.body,
    color: colors.river,
    fontSize: 14,
    fontWeight: "600",
  },
  ctaBusy: {
    opacity: 0.45,
  },
  errorBanner: {
    marginTop: 16,
    borderRadius: radius.sm,
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
    marginTop: 44,
  },
  sectionHeader: {
    marginBottom: 6,
  },
  sectionEyebrow: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 10,
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
    marginBottom: 12,
    maxWidth: 360,
  },
  sectionSoftFail: {
    marginBottom: 16,
  },
  sampleBlock: {
    marginTop: 28,
  },
  sampleEyebrow: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: "rgba(47, 107, 255, 0.8)",
    marginBottom: 12,
  },
  skeletonNotice: {
    height: 48,
    width: "100%",
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.7)",
    marginBottom: 16,
  },
  skeletonIndex: {
    width: 40,
    height: 28,
    borderRadius: radius.xs,
    backgroundColor: "rgba(230, 236, 245, 0.9)",
  },
  skeletonTitle: {
    height: 20,
    width: "55%",
    borderRadius: radius.xs,
    backgroundColor: "rgba(230, 236, 245, 0.9)",
    marginBottom: 10,
  },
  skeletonMeta: {
    height: 14,
    width: "75%",
    borderRadius: radius.xs,
    backgroundColor: "rgba(230, 236, 245, 0.7)",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 22,
    width: "100%",
  },
  rowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  templateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 22,
  },
  index: {
    ...type.display,
    fontSize: 28,
    fontWeight: "800",
    color: colors.mist,
    letterSpacing: -0.5,
    minWidth: 40,
    lineHeight: 32,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
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
    marginTop: 14,
    fontSize: 14,
    color: colors.river,
    fontWeight: "700",
  },
  useTpl: {
    alignSelf: "flex-start",
    marginTop: 14,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.river,
  },
  useTplBusy: {
    opacity: 0.45,
  },
  useTplText: {
    ...type.body,
    fontSize: 13,
    fontWeight: "700",
    color: colors.foam,
  },
});
