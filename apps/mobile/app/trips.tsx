import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
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
import { SheetPresence } from "../src/components/sheet-presence";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailBandStyle,
  softFailMistWashStyle,
} from "../src/components/soft-fail-notice";
import { type } from "../src/theme";

const locale = "zh-CN" as const;

/** Craft SoftFail query parity with web (`?emptySoftFail=1` / `?cardsSoftFail=1` / `?playbooksSoftFail=1`). */
function craftSoftFailOn(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1";
}

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

/**
 * Soft local demo row when listTrips soft-fails (BEA-341 after #211 / #239):
 * lets Soft cards SoftFail own mist-wash rows (web local-trips parity). Empty
 * SoftFail (#233) still owns when API is up and ownTrips is empty.
 */
function softLocalDemoTrip(): Trip {
  const stamp = "2026-05-01T00:00:00.000Z";
  return {
    id: "local-soft-osaka",
    title: t(locale, "trips.placeholder.osaka"),
    destination: "Osaka",
    startDate: "2026-05-01",
    endDate: "2026-05-03",
    timezone: "Asia/Tokyo",
    locale: "zh-CN",
    mapEngine: "auto",
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Destination · dates only — sample / local badge is a chip (web #136 parity). */
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

function tripBadge(trip: Trip): "sample" | "local" | null {
  if (trip.id === "sample-kyoto") return "sample";
  if (trip.id.startsWith("local-")) return "local";
  return null;
}

/** Trips + playbooks density — quieter mark, title leads hierarchy (web DenseIndexMark). */
function DenseIndexMark({ n }: { n: number }) {
  return (
    <Text style={styles.denseIndex} accessibilityElementsHidden>
      {String(n).padStart(2, "0")}
    </Text>
  );
}

function TripBadgeChip({ kind }: { kind: "sample" | "local" }) {
  const local = kind === "local";
  return (
    <View
      style={StyleSheet.flatten([
        styles.badgeChip,
        local ? styles.badgeChipLocal : null,
      ])}
      accessibilityElementsHidden
    >
      <Text
        style={StyleSheet.flatten([
          styles.badgeChipText,
          local ? styles.badgeChipTextLocal : null,
        ])}
      >
        {local
          ? t(locale, "trips.localBadge")
          : t(locale, "trips.sampleBadge")}
      </Text>
    </View>
  );
}

function TripRow({
  trip,
  index,
  showCta,
  last,
  soft,
}: {
  trip: Trip;
  index: number;
  showCta?: boolean;
  last?: boolean;
  /** Mist-wash row while Soft cards SoftFail owns (BEA-341 tip-011). */
  soft?: boolean;
}) {
  const badge = tripBadge(trip);
  const meta = formatTripMeta(trip);
  const badgeLabel =
    badge === "local"
      ? t(locale, "trips.localBadge")
      : badge === "sample"
        ? t(locale, "trips.sampleBadge")
        : "";

  // Single style object — Link asChild + style arrays crash RN Web
  // (CSSStyleDeclaration indexed setter). Prefer StyleSheet.flatten (#76).
  return (
    <Link href={`/trips/${trip.id}`} asChild>
      <Pressable
        style={({ pressed }) =>
          StyleSheet.flatten([
            styles.tripRow,
            soft ? styles.tripRowSoft : null,
            last ? styles.tripRowLast : null,
            pressed ? styles.tripRowPressed : null,
          ])
        }
        accessibilityRole="link"
        accessibilityLabel={`${trip.title}. ${meta}${
          badgeLabel ? ` · ${badgeLabel}` : ""
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

/**
 * Azure inset Start rail — Soft empty badge + softSupport when SoftFail owns
 * (BEA-307 after web #224 / Expo #96; softSupport leaf BEA-416 / #280).
 */
function EmptyRail({ soft }: { soft: boolean }) {
  return (
    <View
      style={StyleSheet.flatten([
        styles.listRail,
        soft ? styles.listRailSoft : null,
      ])}
    >
      <View style={styles.listRailCopy}>
        <Text style={styles.listRailLabel}>
          {t(locale, "trips.seedRail")}
        </Text>
        {soft ? (
          <SoftFailSupport style={styles.softSupportShrink} numberOfLines={1}>
            {t(locale, "trips.emptySoftSupport")}
          </SoftFailSupport>
        ) : (
          <Text style={styles.listRailCount}>
            {t(locale, "trips.emptySupport")}
          </Text>
        )}
      </View>
      {soft ? (
        <SoftFailBadge>{t(locale, "trips.emptySoftBadge")}</SoftFailBadge>
      ) : (
        <View
          style={StyleSheet.flatten([
            styles.statusChip,
            styles.statusChipLive,
          ])}
        >
          <Text
            style={StyleSheet.flatten([
              styles.statusChipText,
              styles.statusChipTextLive,
            ])}
          >
            {t(locale, "trips.seedReady")}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Azure inset trip-cards rail — SoftFailBadge Soft cards + SoftFailSupport
 * when SoftFail owns (BEA-341 depth after #211 / BEA-316; SoftFailSupport
 * residual BEA-433). Soft azure head wash while soft.
 */
function TripsListRail({
  count,
  soft,
}: {
  count: number;
  soft: boolean;
}) {
  return (
    <View
      style={StyleSheet.flatten([
        styles.listRail,
        soft ? styles.listRailSoft : null,
      ])}
    >
      <View style={styles.listRailCopy}>
        <Text style={styles.listRailLabel}>
          {t(locale, "trips.listRail")}
        </Text>
        {soft ? (
          <SoftFailSupport style={styles.softSupportShrink} numberOfLines={1}>
            {t(locale, "trips.cardsSoftSupport")}
          </SoftFailSupport>
        ) : (
          <Text style={styles.listRailCount}>
            {t(locale, "trips.listCount").replace("{n}", String(count))}
          </Text>
        )}
      </View>
      {soft ? (
        <SoftFailBadge>{t(locale, "trips.cardsSoftBadge")}</SoftFailBadge>
      ) : (
        <SoftFailLiveBadge>{t(locale, "trips.listLive")}</SoftFailLiveBadge>
      )}
    </View>
  );
}

/**
 * Azure inset Playbooks rail — SoftFail depth kept (BEA-398 / BEA-372) + wave
 * 49 craft residual (BEA-471): foam/paper sheet tokens · Use press settle.
 * SoftFailBadge Soft playbooks · SoftFailSupport unchanged. Empty SoftFail
 * stays on Start; cards SoftFail stays on Trips (yield). Soft copy never
 * timber / Failed to fetch.
 */
function PlaybooksRail({
  count,
  soft,
}: {
  count: number;
  soft: boolean;
}) {
  return (
    <View
      style={StyleSheet.flatten([
        styles.listRail,
        soft ? styles.listRailSoft : null,
      ])}
    >
      <View style={styles.listRailCopy}>
        <Text style={styles.listRailLabel}>
          {t(locale, "trips.templatesRail")}
        </Text>
        {soft ? (
          <SoftFailSupport style={styles.softSupportShrink} numberOfLines={1}>
            {t(locale, "trips.playbooksSoftSupport")}
          </SoftFailSupport>
        ) : (
          <Text style={styles.listRailCount}>
            {t(locale, "trips.templatesCount").replace("{n}", String(count))}
          </Text>
        )}
      </View>
      {soft ? (
        <SoftFailBadge>{t(locale, "trips.playbooksSoftBadge")}</SoftFailBadge>
      ) : (
        <View
          style={StyleSheet.flatten([
            styles.statusChip,
            styles.statusChipLive,
          ])}
        >
          <Text
            style={StyleSheet.flatten([
              styles.statusChipText,
              styles.statusChipTextLive,
            ])}
          >
            {t(locale, "trips.templatesCatalog")}
          </Text>
        </View>
      )}
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
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={StyleSheet.flatten([
            styles.tripRow,
            i === 2 ? styles.tripRowLast : null,
          ])}
        >
          <View style={styles.skeletonDenseIndex} />
          <View style={styles.rowBody}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonMeta} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Tip 017 — playbooks hydrate skeleton (web TemplatesListSkeleton parity). */
function TemplatesListSkeleton() {
  return (
    <View style={styles.listSheet} accessibilityState={{ busy: true }}>
      <View style={styles.listRail}>
        <View style={styles.skeletonRailLabel} />
        <View style={styles.skeletonChip} />
      </View>
      <View style={styles.skeletonNotice} />
      {[0, 1].map((i) => (
        <View
          key={i}
          style={StyleSheet.flatten([
            styles.templateRow,
            i === 0 ? styles.templateRowFirst : null,
          ])}
        >
          <View style={styles.skeletonDenseIndex} />
          <View style={styles.rowBody}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonMeta} />
            <View style={styles.skeletonUseTpl} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Expo trips home — SoftFail depth kept (empty / cards / playbooks) + wave 51
 * home tabs / chrome residual (BEA-494 beyond #330 / #344): hero + seed CTA
 * tip-011 press · tripMeta inkSoft token. SoftFail helpers · craft queries ·
 * mist band unchanged. Craft: /trips?playbooksSoftFail=1 (also emptySoftFail /
 * cardsSoftFail). SoftFail never timber / Failed to fetch. SoftFail yields
 * across sheets. No /dev gallery.
 */
export default function TripsScreen() {
  const router = useRouter();
  const {
    emptySoftFail: emptySoftFailParam,
    cardsSoftFail: cardsSoftFailParam,
    playbooksSoftFail: playbooksSoftFailParam,
  } = useLocalSearchParams<{
    emptySoftFail?: string | string[];
    cardsSoftFail?: string | string[];
    playbooksSoftFail?: string | string[];
  }>();
  /** Craft preview: /trips?emptySoftFail=1 — SoftFail depth under Start. */
  const emptySoftPreview = craftSoftFailOn(emptySoftFailParam);
  /** Craft preview: /trips?cardsSoftFail=1 — SoftFail depth under Trips cards. */
  const cardsSoftPreview = craftSoftFailOn(cardsSoftFailParam);
  /** Craft preview: /trips?playbooksSoftFail=1 — SoftFail depth under Playbooks. */
  const playbooksSoftPreview = craftSoftFailOn(playbooksSoftFailParam);
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
  const scrollRef = useRef<ScrollView>(null);
  const playbooksY = useRef(0);

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
      // Soft-fail transport — SoftFailNotice owns copy; never timber Failed to fetch.
      if (!isApiSoftFail(e)) {
        setError(e instanceof Error ? e.message : "load_failed");
      }
    }

    const byId = new Map<string, Trip>();
    for (const trip of remoteTrips ?? []) byId.set(trip.id, trip);
    if (remoteFailed || !byId.has("sample-kyoto")) {
      byId.set("sample-kyoto", sampleTripStub());
    }
    /**
     * Soft local demo row when list soft-fails (BEA-341 after #211) or craft
     * `?cardsSoftFail=1` (BEA-425): Soft cards SoftFail owns mist-wash rows.
     * Empty SoftFail (#233) still owns when API is up and ownTrips is empty
     * unless cards craft seeds the soft local row — never timber / Failed to fetch.
     */
    const seedCardsSoftDemo =
      cardsSoftPreview &&
      !emptySoftPreview &&
      ![...byId.keys()].some((id) => id !== "sample-kyoto");
    if (
      (remoteFailed || seedCardsSoftDemo) &&
      ![...byId.keys()].some((id) => id !== "sample-kyoto")
    ) {
      byId.set("local-soft-osaka", softLocalDemoTrip());
    }
    setTrips(
      Array.from(byId.values()).sort((a, b) => {
        if (a.id === "sample-kyoto") return 1;
        if (b.id === "sample-kyoto") return -1;
        return b.updatedAt.localeCompare(a.updatedAt);
      }),
    );

    if (remoteFailed || cardsSoftPreview) {
      setSoftNotice(t(locale, "trips.cardsSoftFail"));
      setError(null);
    } else {
      setSoftNotice(null);
    }
    setHydrated(true);
  }, [cardsSoftPreview, emptySoftPreview]);

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
        setSoftNotice(t(locale, "trips.cardsSoftFail"));
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
  /**
   * Craft SoftFail query parity (BEA-425): `?emptySoftFail=1` forces Start
   * SoftFail rail (empty owns); `?cardsSoftFail=1` seeds soft local demo /
   * SoftFail under Trips so empty yields. Empty SoftFail craft wins over cards
   * when both are set (translate empty/talk parity).
   */
  const showEmptyInvite =
    hydrated &&
    (emptySoftPreview && !cardsSoftPreview
      ? true
      : ownTrips.length === 0);
  const sampleTrips = trips.filter((x) => x.id === "sample-kyoto");
  /**
   * SoftFail ownership (BEA-307 empty / BEA-341 cards / BEA-372 playbooks) +
   * craft SoftFail query parity (BEA-425 after #298 / #282):
   * empty sheet owns SoftFail while empty invite / `?emptySoftFail=1`; cards
   * sheet owns SoftFail when trips exist / `?cardsSoftFail=1`; playbooks sheet
   * owns SoftFail under azure Playbooks rail when templates soft /
   * `?playbooksSoftFail=1`. SoftFail yields across sheets (no double depth).
   * Empty copy always emptySoftFail; cards copy always cardsSoftFail;
   * playbooks copy always templatesSoftOffline — never inherit softNotice /
   * timber. Soft copy never Failed to fetch.
   */
  const emptyOwnsSoft = showEmptyInvite;
  const cardsOwnsSoft = hydrated && !showEmptyInvite;
  const emptySoftOpen = emptyOwnsSoft;
  const cardsSoftOpen =
    cardsOwnsSoft && !error && (Boolean(softNotice) || cardsSoftPreview);
  const emptySoftCopy = t(locale, "trips.emptySoftFail");
  /** Cards SoftFail copy owned by Trips rail — never inherit softNotice. */
  const cardsSoftCopy = t(locale, "trips.cardsSoftFail");
  const cardsSoftActive = cardsSoftOpen && !emptyOwnsSoft;
  /**
   * Playbooks SoftFail helpers (BEA-398 after #284 / BEA-372; web #245 parity)
   * + craft SoftFail query parity (BEA-405 / BEA-425): SoftFailBadge Soft
   * playbooks · SoftFailSupport · softFailBandStyle mist band ·
   * softFailMistWashStyle tip-011 body while soft. Craft:
   * /trips?playbooksSoftFail=1 — mirrors web. Empty SoftFail (#233) stays on
   * Start; cards SoftFail (#259) stays on Trips (yield / no overlap). Soft
   * copy never timber / Failed to fetch.
   */
  const playbooksSoftOpen =
    hydrated && (templatesSoft || playbooksSoftPreview);
  const playbooksSoftCopy = t(locale, "trips.templatesSoftOffline");
  /** Timber banner — scrub soft-fail transport noise (Failed to fetch). */
  const hardError =
    error && !isApiSoftFail(new Error(error)) ? error : null;

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
      ref={scrollRef}
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
              style={({ pressed }) =>
                StyleSheet.flatten([
                  styles.solidCta,
                  newBusy ? styles.ctaBusy : null,
                  pressed && !newBusy ? styles.ctaPressed : null,
                ])
              }
              disabled={newBusy}
              onPress={startNewTrip}
              accessibilityRole="button"
              accessibilityLabel={t(locale, "trips.new")}
            >
              <Text style={styles.solidCtaText}>{t(locale, "trips.new")}</Text>
            </Pressable>
            <Link href="/trips/sample-kyoto" asChild>
              <Pressable
                style={({ pressed }) =>
                  StyleSheet.flatten([
                    styles.outlineCta,
                    pressed ? styles.ctaPressed : null,
                  ])
                }
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
                style={({ pressed }) =>
                  StyleSheet.flatten([
                    styles.ghostCta,
                    pressed ? styles.ctaPressed : null,
                  ])
                }
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

        {hardError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{hardError}</Text>
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

          {/* SoftFailNotice stays sheet-scoped — empty / cards, never page hero. */}
          {!hydrated ? (
            <SheetPresence open rise={10} delayMs={40}>
              <TripsListSkeleton />
            </SheetPresence>
          ) : showEmptyInvite ? (
            <SheetPresence
              open
              rise={10}
              delayMs={60}
              accessibilityLabel={t(locale, "trips.seedRail")}
            >
              {/*
                Empty SoftFail depth (BEA-307 after web #224 / Expo #96) +
                craft SoftFail query parity (BEA-425): azure Start rail · Soft
                empty badge · emptySoftSupport · compact SoftFailNotice ·
                tip-011 softFailMistWashStyle CTA body · SheetPresence sample
                cards. Craft: ?emptySoftFail=1 — never timber / Failed to fetch.
              */}
              <View style={styles.listSheet}>
                <EmptyRail soft={emptySoftOpen} />
                {/* Compact SoftFail under azure rail — empty owns emptySoftFail; never timber / Failed to fetch. */}
                <SoftFailNotice
                  open={!hardError && emptySoftOpen}
                  compact
                  style={styles.listSoftFail}
                >
                  {emptySoftCopy}
                </SoftFailNotice>
                <SheetPresence
                  open
                  rise={8}
                  delayMs={40}
                  style={StyleSheet.flatten([
                    styles.seedActions,
                    emptySoftOpen ? softFailMistWashStyle : null,
                  ])}
                  accessibilityLabel={t(locale, "trips.seedActions")}
                >
                  <Pressable
                    style={({ pressed }) =>
                      StyleSheet.flatten([
                        styles.solidCta,
                        newBusy ? styles.ctaBusy : null,
                        pressed && !newBusy ? styles.ctaPressed : null,
                      ])
                    }
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
                      style={({ pressed }) =>
                        StyleSheet.flatten([
                          styles.outlineCta,
                          pressed ? styles.ctaPressed : null,
                        ])
                      }
                      accessibilityRole="link"
                      accessibilityLabel={t(locale, "trips.openSample")}
                    >
                      <Text style={styles.outlineCtaText}>
                        {t(locale, "trips.openSample")}
                      </Text>
                    </Pressable>
                  </Link>
                  <Pressable
                    style={({ pressed }) =>
                      StyleSheet.flatten([
                        styles.seedPlaybooksHint,
                        pressed ? styles.ctaPressed : null,
                      ])
                    }
                    onPress={() =>
                      scrollRef.current?.scrollTo({
                        y: Math.max(0, playbooksY.current - 12),
                        animated: true,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t(locale, "trips.seedPlaybooks")}
                  >
                    <Text style={styles.seedPlaybooksHintText}>
                      {t(locale, "trips.seedPlaybooks")}
                    </Text>
                  </Pressable>
                </SheetPresence>
                {sampleTrips.length > 0 ? (
                  <SheetPresence open rise={8} delayMs={80}>
                    <View style={styles.seedSampleBlock}>
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
                  </SheetPresence>
                ) : null}
              </View>
            </SheetPresence>
          ) : (
            <SheetPresence
              open
              rise={10}
              delayMs={60}
              accessibilityLabel={t(locale, "trips.listRail")}
            >
              {/*
                Trip cards SoftFail depth (BEA-341 after #211 / BEA-316) +
                craft SoftFail query parity (BEA-425): azure Trips rail · Soft
                cards badge · softSupport · compact SoftFail mist band ·
                tip-011 mist-wash stage. Craft: ?cardsSoftFail=1 — never timber
                / Failed to fetch. Yields while empty owns.
              */}
              <View style={styles.listSheet}>
                <TripsListRail
                  count={trips.length}
                  soft={cardsSoftActive}
                />
                {/* Compact SoftFail under azure Trips rail — never timber. */}
                <SoftFailNotice
                  open={cardsSoftActive}
                  compact
                  style={styles.listSoftFail}
                >
                  {cardsSoftCopy}
                </SoftFailNotice>
                <SheetPresence
                  open
                  rise={8}
                  delayMs={50}
                  style={StyleSheet.flatten([
                    styles.cardsBody,
                    cardsSoftActive ? softFailMistWashStyle : null,
                  ])}
                  accessibilityLabel={t(locale, "trips.yours")}
                >
                  <View
                    style={StyleSheet.flatten([
                      styles.cardsStage,
                      cardsSoftActive ? styles.cardsStageSoft : null,
                    ])}
                  >
                    {trips.map((trip, index) => (
                      <TripRow
                        key={trip.id}
                        trip={trip}
                        index={index}
                        showCta
                        soft={cardsSoftActive}
                        last={index === trips.length - 1}
                      />
                    ))}
                  </View>
                </SheetPresence>
              </View>
            </SheetPresence>
          )}
        </View>

        <View
          style={StyleSheet.flatten([styles.section, styles.sectionSpaced])}
          onLayout={(e) => {
            playbooksY.current = e.nativeEvent.layout.y;
          }}
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

          {!hydrated ? (
            <SheetPresence open rise={10} delayMs={80}>
              <TemplatesListSkeleton />
            </SheetPresence>
          ) : (
            <SheetPresence
              open
              rise={10}
              delayMs={80}
              accessibilityLabel={t(locale, "trips.templatesRail")}
            >
              {/*
                Playbooks SoftFail helpers (BEA-398 after #284 / BEA-372; web #245
                parity) + craft SoftFail query parity (BEA-405): azure Playbooks
                rail · SoftFailBadge · SoftFailSupport · softFailBandStyle ·
                softFailMistWashStyle catalog · Craft: ?playbooksSoftFail=1 ·
                StyleSheet.flatten — never timber / Failed to fetch.
                Empty SoftFail (#233) stays on Start; cards SoftFail (#259)
                stays on Trips (yield / no overlap). Yields web #245 / BEA-405.
                Editorial residual (BEA-457): DenseIndexMark + denser rows —
                web #217 parity; SoftFail depth unchanged.
              */}
              <View style={styles.listSheet}>
                <PlaybooksRail
                  count={templates.length}
                  soft={playbooksSoftOpen}
                />
                {/* Compact SoftFail under azure Playbooks rail — never timber. */}
                <SoftFailNotice
                  open={playbooksSoftOpen}
                  compact
                  style={softFailBandStyle}
                >
                  {playbooksSoftCopy}
                </SoftFailNotice>
                <SheetPresence
                  open
                  rise={8}
                  delayMs={50}
                  style={StyleSheet.flatten([
                    styles.playbooksBody,
                    playbooksSoftOpen ? softFailMistWashStyle : null,
                  ])}
                  accessibilityLabel={t(locale, "trips.templates")}
                >
                  <View
                    style={StyleSheet.flatten([
                      styles.playbooksStage,
                      playbooksSoftOpen
                        ? StyleSheet.flatten([
                            softFailMistWashStyle,
                            styles.playbooksStageSoft,
                          ])
                        : null,
                    ])}
                  >
                    {templates.map((tpl, index) => {
                      const title = tpl.title[locale] ?? tpl.title["zh-CN"];
                      const desc =
                        tpl.description[locale] ?? tpl.description["zh-CN"];
                      const busy = creatingId === tpl.id;
                      const first = index === 0;
                      const tplRowStyle = StyleSheet.flatten([
                        styles.templateRow,
                        playbooksSoftOpen ? styles.templateRowSoft : null,
                        first ? styles.templateRowFirst : null,
                      ]);
                      return (
                        <View key={tpl.id} style={tplRowStyle}>
                          <DenseIndexMark n={index + 1} />
                          <View style={styles.rowBody}>
                            <Text style={styles.templateTitle}>{title}</Text>
                            <Text style={styles.rowMeta}>{desc}</Text>
                            <Text style={styles.templateStats}>
                              {tpl.destination} · {tpl.dayCount}{" "}
                              {t(locale, "trips.dayUnit")} · {tpl.stopCount}{" "}
                              {t(locale, "trips.stopUnit")}
                            </Text>
                            <Pressable
                              style={({ pressed }) =>
                                StyleSheet.flatten([
                                  styles.useTpl,
                                  busy ? styles.useTplBusy : null,
                                  pressed && !busy ? styles.ctaPressed : null,
                                ])
                              }
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
                </SheetPresence>
              </View>
            </SheetPresence>
          )}
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
    lineHeight: 40,
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
    borderColor: `${colors.river}59`,
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
  /** Tip 011 — hero / seed CTA press settle (settings / Use residual parity). */
  ctaPressed: {
    transform: [{ scale: 0.98 }],
  },
  errorBanner: {
    marginTop: 16,
    borderRadius: radius.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.timber,
    backgroundColor: `${colors.timber}14`,
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
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
    marginBottom: 10,
  },
  sectionTitle: {
    ...type.display,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 28,
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
  listSheet: {
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    // Soft Lumen lift — foam sheet over Mist topo (settings #338 parity)
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
    backgroundColor: colors.paper,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  /** Soft azure Trips rail wash when SoftFail owns depth (BEA-341). */
  listRailSoft: {
    backgroundColor: colors.paper,
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
    color: colors.inkSoft,
    flexShrink: 1,
  },
  /** Layout-only shrink for SoftFailSupport beside azure Playbooks rail. */
  softSupportShrink: {
    flexShrink: 1,
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
  /** Mist SoftFail strip under azure Trips / empty Start / Playbooks rail — border-b before body. */
  listSoftFail: {
    marginBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderTopWidth: 0,
  },
  cardsBody: {
    paddingVertical: 0,
  },
  cardsStage: {
    width: "100%",
  },
  /** Mist-wash stage inset with azure river rail while SoftFail open (Talk parity). */
  cardsStageSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.55)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    borderRadius: radius.md,
    marginHorizontal: 8,
    marginVertical: 8,
    overflow: "hidden",
  },
  playbooksBody: {
    paddingVertical: 0,
  },
  playbooksStage: {
    width: "100%",
  },
  /**
   * Playbooks SoftFail stage chrome (BEA-398) — softFailMistWashStyle supplies
   * mist wash; keep azure river inset + pad while SoftFail owns.
   */
  playbooksStageSoft: {
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    borderRadius: radius.md,
    marginHorizontal: 8,
    marginVertical: 8,
    overflow: "hidden",
  },
  seedActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  seedPlaybooksHint: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  seedPlaybooksHintText: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkSoft,
    textDecorationLine: "underline",
    textDecorationColor: colors.inkSoft,
  },
  seedSampleBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  sampleEyebrow: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
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
  skeletonUseTpl: {
    marginTop: 12,
    height: 34,
    width: 96,
    borderRadius: radius.md,
    backgroundColor: "rgba(47, 107, 255, 0.18)",
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
  /** Soft mist row wash while Soft cards SoftFail owns (BEA-341 tip-011). */
  tripRowSoft: {
    backgroundColor: "rgba(244, 246, 250, 0.35)",
  },
  tripRowLast: {
    borderBottomWidth: 0,
  },
  tripRowPressed: {
    // Press wash — mist@25 twin of web row `hover:bg-mist/25`
    backgroundColor: `${colors.mist}40`,
  },
  templateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 16,
    paddingHorizontal: 14,
    width: "100%",
  },
  /** Soft mist row wash while Soft playbooks SoftFail owns (BEA-372 tip-011). */
  templateRowSoft: {
    backgroundColor: "rgba(244, 246, 250, 0.35)",
  },
  templateRowFirst: {
    borderTopWidth: 0,
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
    // Sample chip — river@10 twin of web TripBadgeChip `bg-river/10`
    backgroundColor: `${colors.river}1A`,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  /** Local chip — mist wash (web TripBadgeChip local parity). */
  badgeChipLocal: {
    backgroundColor: colors.mist,
  },
  badgeChipText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  badgeChipTextLocal: {
    color: colors.inkSoft,
  },
  templateTitle: {
    ...type.display,
    fontSize: 18,
    color: colors.ink,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  tripMeta: {
    ...type.body,
    marginTop: 4,
    fontSize: 12,
    // leading-snug (12×1.375≈16.5) — already at bar vs web meta
    lineHeight: 17,
    // Meta ladder — inkSoft@90 twin of web `text-ink-soft/90`
    color: `${colors.inkSoft}E6`,
  },
  rowMeta: {
    ...type.body,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkSoft,
  },
  templateStats: {
    ...type.body,
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
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
    marginTop: 12,
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
