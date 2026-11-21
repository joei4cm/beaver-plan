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

/** Destination · dates only — sample badge is a chip (web #136 parity). */
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
  return parts.join(" · ") || "—";
}

function tripBadge(trip: Trip): "sample" | null {
  return trip.id === "sample-kyoto" ? "sample" : null;
}

/** Playbooks editorial index. */
function IndexMark({ n }: { n: number }) {
  return (
    <Text style={styles.index} accessibilityElementsHidden>
      {String(n).padStart(2, "0")}
    </Text>
  );
}

/** Trips list density — quieter mark, title leads hierarchy (web DenseIndexMark). */
function DenseIndexMark({ n }: { n: number }) {
  return (
    <Text style={styles.denseIndex} accessibilityElementsHidden>
      {String(n).padStart(2, "0")}
    </Text>
  );
}

function TripBadgeChip({ kind }: { kind: "sample" }) {
  return (
    <View style={styles.badgeChip} accessibilityElementsHidden>
      <Text style={styles.badgeChipText}>
        {t(locale, "trips.sampleBadge")}
      </Text>
    </View>
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
  const badge = tripBadge(trip);
  const meta = formatTripMeta(trip);

  // Single style object — Link asChild + style arrays crash RN Web
  // (CSSStyleDeclaration indexed setter). Prefer StyleSheet.flatten (#76).
  return (
    <Link href={`/trips/${trip.id}`} asChild>
      <Pressable
        style={({ pressed }) =>
          StyleSheet.flatten([
            styles.tripRow,
            last ? styles.tripRowLast : null,
            pressed ? styles.tripRowPressed : null,
          ])
        }
        accessibilityRole="link"
        accessibilityLabel={`${trip.title}. ${meta}${
          badge ? ` · ${t(locale, "trips.sampleBadge")}` : ""
        }`}
      >
        <DenseIndexMark n={index + 1} />
        <View style={styles.rowBody}>
          <View style={styles.titleRow}>
            <Text style={styles.tripTitle} numberOfLines={2}>
              {trip.title}
            </Text>
            {badge ? <TripBadgeChip kind={badge} /> : null}
          </View>
          <Text style={styles.tripMeta}>{meta}</Text>
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

/** Azure inset list rail — count + Demo/Live chip (web #136). */
function TripsListRail({
  count,
  soft,
}: {
  count: number;
  soft: boolean;
}) {
  return (
    <View style={styles.listRail}>
      <View style={styles.listRailCopy}>
        <Text style={styles.listRailLabel}>
          {t(locale, "trips.listRail")}
        </Text>
        <Text style={styles.listRailCount}>
          {t(locale, "trips.listCount").replace("{n}", String(count))}
        </Text>
      </View>
      <View
        style={StyleSheet.flatten([
          styles.statusChip,
          soft ? styles.statusChipDemo : styles.statusChipLive,
        ])}
      >
        <Text
          style={StyleSheet.flatten([
            styles.statusChipText,
            soft ? styles.statusChipTextDemo : styles.statusChipTextLive,
          ])}
        >
          {soft
            ? t(locale, "trips.listDemo")
            : t(locale, "trips.listLive")}
        </Text>
      </View>
    </View>
  );
}

/** Tip 017 — soft-notice slot + dense rows while hydrating (web TripsListSkeleton). */
function TripsListSkeleton() {
  return (
    <View style={styles.listSheet} accessibilityState={{ busy: true }}>
      <View style={styles.listRail}>
        <View style={styles.skeletonRailLabel} />
        <View style={styles.skeletonChip} />
      </View>
      <View style={styles.skeletonNotice} />
      <View
        style={StyleSheet.flatten([styles.tripRow, styles.tripRowLast])}
      >
        <View style={styles.skeletonDenseIndex} />
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
  const listSoft = Boolean(softNotice);

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

          {/* Empty / loading: SoftFailNotice under section header.
              Populated list: compact SoftFailNotice lives under the azure rail. */}
          <SoftFailNotice
            open={
              !error &&
              Boolean(softNotice) &&
              hydrated &&
              showEmptyInvite
            }
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
                <View style={styles.sampleSheet}>
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
            <View style={styles.listSheet}>
              <TripsListRail count={trips.length} soft={listSoft} />
              <SoftFailNotice
                open={!error && Boolean(softNotice)}
                compact
                style={styles.listSoftFail}
              >
                {softNotice ?? ""}
              </SoftFailNotice>
              {trips.map((trip, index) => (
                <TripRow
                  key={trip.id}
                  trip={trip}
                  index={index}
                  showCta
                  last={index === trips.length - 1}
                />
              ))}
            </View>
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
  listSheet: {
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    // Soft Lumen lift — paper sheet over Mist topo
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  listRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  listRailCopy: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  listRailLabel: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
  },
  listRailCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    color: "rgba(100, 116, 139, 0.85)",
  },
  statusChip: {
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusChipDemo: {
    backgroundColor: colors.mist,
  },
  statusChipLive: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  statusChipText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  statusChipTextDemo: {
    color: colors.inkSoft,
  },
  statusChipTextLive: {
    color: colors.river,
  },
  listSoftFail: {
    marginBottom: 0,
  },
  sampleSheet: {
    marginTop: 24,
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
  },
  sampleEyebrow: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: "rgba(47, 107, 255, 0.8)",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
  },
  skeletonNotice: {
    height: 40,
    width: "100%",
    backgroundColor: "rgba(230, 236, 245, 0.55)",
  },
  skeletonRailLabel: {
    height: 12,
    width: 88,
    borderRadius: radius.xs,
    backgroundColor: "rgba(230, 236, 245, 0.9)",
  },
  skeletonChip: {
    height: 18,
    width: 44,
    borderRadius: radius.xs,
    backgroundColor: "rgba(230, 236, 245, 0.9)",
  },
  skeletonDenseIndex: {
    width: 28,
    height: 20,
    borderRadius: radius.xs,
    backgroundColor: "rgba(230, 236, 245, 0.9)",
    marginTop: 2,
  },
  skeletonTitle: {
    height: 18,
    width: "55%",
    borderRadius: radius.xs,
    backgroundColor: "rgba(230, 236, 245, 0.9)",
    marginBottom: 8,
  },
  skeletonMeta: {
    height: 12,
    width: "72%",
    borderRadius: radius.xs,
    backgroundColor: "rgba(230, 236, 245, 0.7)",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 16,
    paddingHorizontal: 14,
    width: "100%",
  },
  tripRowLast: {
    borderBottomWidth: 0,
  },
  tripRowPressed: {
    backgroundColor: "rgba(230, 236, 245, 0.35)",
  },
  templateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 22,
  },
  rowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  denseIndex: {
    ...type.display,
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: colors.mist,
    letterSpacing: -0.4,
    minWidth: 32,
    lineHeight: 24,
    marginTop: 2,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  tripTitle: {
    ...type.display,
    fontSize: 18,
    color: colors.ink,
    fontWeight: "600",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  badgeChip: {
    borderRadius: radius.xs,
    backgroundColor: "rgba(47, 107, 255, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeChipText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  templateTitle: {
    ...type.display,
    fontSize: 18,
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  tripMeta: {
    ...type.body,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(100, 116, 139, 0.92)",
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
    marginTop: 10,
    fontSize: 13,
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
