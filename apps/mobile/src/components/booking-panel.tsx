import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  BOOKING_LINK_KINDS,
  DemoBookingProvider,
  normalizeBookingLinks,
  type BookingLinkKind,
  type BookingSuggestion,
  type BookingSuggestionKind,
  type Stop,
  type Trip,
} from "@beaver/core";
import { t, type Locale } from "@beaver/i18n";
import { colors, motion, radius } from "@beaver/ui-tokens";
import {
  fetchBookingStatus,
  patchStopBookingLinks,
  searchBooking,
} from "../api";
import { type } from "../theme";
import { SoftFailNotice } from "./soft-fail-notice";

type Props = {
  tripId: string;
  locale: Locale;
  trip: Trip;
  stop: Stop | null;
  destinationHint?: string;
  onSaved: (stop: Stop) => void;
  defaultOpen?: boolean;
};

type DraftRow = {
  kind: BookingLinkKind;
  url: string;
  providerLabel: string;
};

type KindFilter = BookingSuggestionKind | "all";

const KIND_FILTERS: KindFilter[] = ["all", "hotel", "activity"];
const demoProvider = new DemoBookingProvider();
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

function emptyDrafts(): DraftRow[] {
  return BOOKING_LINK_KINDS.map((kind) => ({
    kind,
    url: "",
    providerLabel: "",
  }));
}

function draftsFromStop(stop: Stop | null): DraftRow[] {
  const base = emptyDrafts();
  if (!stop) return base;
  for (const link of stop.bookingLinks ?? []) {
    const row = base.find((r) => r.kind === link.kind);
    if (row) {
      row.url = link.url;
      row.providerLabel = link.providerLabel ?? "";
    }
  }
  return base;
}

function suggestionKindLabel(locale: Locale, kind: BookingSuggestionKind) {
  return kind === "hotel"
    ? t(locale, "planner.booking.kind.hotel")
    : t(locale, "planner.booking.kind.ticket");
}

function filterLabel(locale: Locale, kind: KindFilter) {
  if (kind === "all") return t(locale, "planner.booking.filterAll");
  if (kind === "hotel") return t(locale, "planner.booking.kind.hotel");
  return t(locale, "planner.booking.filterActivity");
}

function isNoiseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /_503$|_502$|_504$|Failed to fetch|Network request failed|load_failed|ECONNREFUSED|booking\//i.test(
    msg,
  );
}

async function searchLocal(
  city: string,
  checkIn: string,
  checkOut: string,
  kind: KindFilter,
  locale: Locale,
) {
  const suggestions = await demoProvider.search({
    city,
    checkIn: checkIn || undefined,
    checkOut: checkOut || undefined,
    kind,
    locale,
  });
  return {
    suggestions,
    mode: "demo" as const,
    provider: demoProvider.id,
  };
}

/**
 * Expo OTA booking sheet — soft-fail + depth chrome after web #78 / #95.
 * Azure header rail · SoftFailNotice · Search · Results · Pinned.
 */
export function BookingPanel({
  tripId,
  locale,
  trip,
  stop,
  destinationHint,
  onSaved,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(() => Boolean(stop) || defaultOpen);
  const [drafts, setDrafts] = useState<DraftRow[]>(() => draftsFromStop(stop));
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<BookingSuggestion[]>([]);
  const [statusMode, setStatusMode] = useState<"demo" | "configured">("demo");
  const [softDemo, setSoftDemo] = useState(false);
  const [searched, setSearched] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [city, setCity] = useState(destinationHint ?? "");
  const [checkIn, setCheckIn] = useState(trip.startDate ?? "");
  const [checkOut, setCheckOut] = useState(trip.endDate ?? "");
  const [seeded, setSeeded] = useState(false);
  const bodyAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setDrafts(draftsFromStop(stop));
    if (stop) setOpen(true);
  }, [stop]);

  useEffect(() => {
    setCity((prev) => prev || destinationHint || "");
  }, [destinationHint]);

  useEffect(() => {
    void fetchBookingStatus()
      .then((res) => {
        setStatusMode(res.mode);
        setSoftDemo(false);
      })
      .catch(() => {
        setStatusMode("demo");
        setSoftDemo(true);
      });
  }, []);

  useEffect(() => {
    if (seeded) return;
    const q = (destinationHint || city || trip.destination || "").trim();
    if (!q) return;
    setSeeded(true);
    void (async () => {
      try {
        const res = await searchBooking({
          city: q,
          checkIn: checkIn || undefined,
          checkOut: checkOut || undefined,
          kind: "all",
          locale,
        });
        setSuggestions(res.suggestions);
        setStatusMode(res.mode);
        setSoftDemo(false);
        setSearched(true);
      } catch (e) {
        if (isNoiseError(e)) {
          const local = await searchLocal(q, checkIn, checkOut, "all", locale);
          setSuggestions(local.suggestions);
          setStatusMode(local.mode);
          setSoftDemo(true);
          setSearched(true);
        }
      }
    })();
  }, [seeded, destinationHint, city, trip.destination, checkIn, checkOut, locale]);

  useEffect(() => {
    if (!open) {
      bodyAnim.setValue(0);
      return;
    }
    bodyAnim.setValue(0);
    Animated.timing(bodyAnim, {
      toValue: 1,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [open, bodyAnim]);

  const savedCount = useMemo(
    () => (stop?.bookingLinks ?? []).filter((l) => l.url).length,
    [stop],
  );

  function updateDraft(
    kind: BookingLinkKind,
    patch: Partial<Omit<DraftRow, "kind">>,
  ) {
    setDrafts((prev) =>
      prev.map((row) => (row.kind === kind ? { ...row, ...patch } : row)),
    );
  }

  const applyLocalStop = useCallback(
    (bookingLinks: ReturnType<typeof normalizeBookingLinks>) => {
      if (!stop) return;
      onSaved({ ...stop, bookingLinks });
    },
    [onSaved, stop],
  );

  async function save() {
    if (!stop) return;
    setSaving(true);
    const bookingLinks = normalizeBookingLinks(
      drafts.map((d) => ({
        kind: d.kind,
        url: d.url.trim(),
        providerLabel: d.providerLabel.trim() || undefined,
      })),
    );
    try {
      const res = await patchStopBookingLinks({
        tripId,
        stopId: stop.id,
        bookingLinks,
        expectedVersion: trip.version,
      });
      setSoftDemo(false);
      onSaved(res.stop);
    } catch (e) {
      if (isNoiseError(e)) {
        setSoftDemo(true);
        applyLocalStop(bookingLinks);
      }
    } finally {
      setSaving(false);
    }
  }

  async function runSearch() {
    const q = city.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await searchBooking({
        city: q,
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        kind: kindFilter,
        locale,
      });
      setSuggestions(res.suggestions);
      setStatusMode(res.mode);
      setSoftDemo(false);
      setSearched(true);
      setOpen(true);
    } catch (e) {
      if (isNoiseError(e)) {
        const local = await searchLocal(
          q,
          checkIn,
          checkOut,
          kindFilter,
          locale,
        );
        setSuggestions(local.suggestions);
        setStatusMode(local.mode);
        setSoftDemo(true);
        setSearched(true);
        setOpen(true);
      }
    } finally {
      setSearching(false);
    }
  }

  function applySuggestion(s: BookingSuggestion) {
    const kind: BookingLinkKind = s.kind === "hotel" ? "hotel" : "ticket";
    updateDraft(kind, {
      url: s.url,
      providerLabel: s.providerLabel,
    });
    setOpen(true);
  }

  function openExternal(url: string) {
    void Linking.openURL(url);
  }

  const isConfigured = statusMode === "configured" && !softDemo;
  const softCopy = softDemo
    ? t(locale, "planner.booking.softFail")
    : statusMode === "demo"
      ? t(locale, "planner.booking.demoNotice")
      : null;
  const badge = isConfigured
    ? t(locale, "planner.booking.configuredBadge")
    : t(locale, "planner.booking.demoBadge");

  const bodyStyle = {
    opacity: bodyAnim,
    transform: [
      {
        translateY: bodyAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

  return (
    <View
      style={styles.root}
      accessibilityLabel={t(locale, "planner.booking.title")}
    >
      <Pressable
        style={styles.header}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerEyebrow}>
              {t(locale, "planner.booking.suggestEyebrow")}
            </Text>
            <Text style={styles.headerTitle}>
              {t(locale, "planner.booking.title")}
            </Text>
            <View
              style={StyleSheet.flatten([
                styles.badge,
                isConfigured ? styles.badgeLive : styles.badgeDemo,
              ])}
            >
              <Text
                style={StyleSheet.flatten([
                  styles.badgeText,
                  isConfigured ? styles.badgeTextLive : styles.badgeTextDemo,
                ])}
              >
                {badge}
              </Text>
            </View>
          </View>
          <Text style={styles.headerSupport}>
            {stop
              ? t(locale, "planner.booking.forStop").replace(
                  "{name}",
                  stop.place.name,
                )
              : t(locale, "planner.booking.support")}
            {savedCount > 0
              ? ` · ${t(locale, "planner.booking.savedCount").replace(
                  "{n}",
                  String(savedCount),
                )}`
              : ""}
          </Text>
        </View>
        <Text style={StyleSheet.flatten([styles.chevron, open && styles.chevronOpen])}>
          ▾
        </Text>
      </Pressable>

      {open ? (
        <Animated.View style={StyleSheet.flatten([styles.body, bodyStyle])}>
          <SoftFailNotice
            open={Boolean(softCopy)}
            style={styles.softFail}
          >
            {softCopy ?? ""}
          </SoftFailNotice>

          {/* Search */}
          <View
            style={styles.section}
            accessibilityLabel={t(locale, "planner.booking.searchEyebrow")}
          >
            <Text style={styles.sectionEyebrow}>
              {t(locale, "planner.booking.searchEyebrow")}
            </Text>
            <Text style={styles.sectionTitle}>
              {t(locale, "planner.booking.suggestTitle")}
            </Text>
            <Text style={styles.sectionSupport}>
              {t(locale, "planner.booking.suggestSupport")}
            </Text>

            <View
              style={styles.filterRow}
              accessibilityRole="tablist"
              accessibilityLabel={t(locale, "planner.booking.filterLabel")}
            >
              {KIND_FILTERS.map((id) => {
                const on = kindFilter === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => setKindFilter(id)}
                    style={StyleSheet.flatten([
                      styles.filterChip,
                      on ? styles.filterChipOn : styles.filterChipOff,
                    ])}
                  >
                    <Text
                      style={StyleSheet.flatten([
                        styles.filterChipText,
                        on ? styles.filterChipTextOn : styles.filterChipTextOff,
                      ])}
                    >
                      {filterLabel(locale, id)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.fieldGrid}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {t(locale, "planner.booking.cityPlaceholder")}
                </Text>
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder={t(locale, "planner.booking.cityPlaceholder")}
                  placeholderTextColor="rgba(100,116,139,0.5)"
                  style={styles.input}
                  autoCorrect={false}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {t(locale, "planner.booking.checkIn")}
                </Text>
                <TextInput
                  value={checkIn}
                  onChangeText={setCheckIn}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="rgba(100,116,139,0.5)"
                  style={styles.input}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {t(locale, "planner.booking.checkOut")}
                </Text>
                <TextInput
                  value={checkOut}
                  onChangeText={setCheckOut}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="rgba(100,116,139,0.5)"
                  style={styles.input}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <Pressable
              style={StyleSheet.flatten([
                styles.searchBtn,
                searching ? styles.searchBtnBusy : null,
              ])}
              disabled={searching}
              onPress={() => void runSearch()}
              accessibilityRole="button"
            >
              <Text style={styles.searchBtnLabel}>
                {searching
                  ? t(locale, "planner.booking.searching")
                  : t(locale, "planner.booking.search")}
              </Text>
            </Pressable>
          </View>

          {/* Results */}
          <View
            style={styles.section}
            accessibilityLabel={t(locale, "planner.booking.resultsEyebrow")}
          >
            <Text style={styles.sectionEyebrow}>
              {t(locale, "planner.booking.resultsEyebrow")}
            </Text>

            {searching ? (
              <View style={styles.loadingBlock} accessibilityState={{ busy: true }}>
                <View style={styles.skeletonCard} />
                <View style={styles.skeletonCard} />
                <Text style={styles.loadingHint}>
                  {t(locale, "planner.booking.loadingHint")}
                </Text>
              </View>
            ) : null}

            {!searching && searched && suggestions.length === 0 ? (
              <Text style={styles.emptyResults}>
                {t(locale, "planner.booking.emptyResults")}
              </Text>
            ) : null}

            {!searching && suggestions.length > 0 ? (
              <View style={styles.resultsList}>
                <Text style={styles.resultsCount}>
                  {t(locale, "planner.booking.resultsTitle").replace(
                    "{n}",
                    String(suggestions.length),
                  )}
                </Text>
                {suggestions.map((s) => (
                  <View key={s.id} style={styles.offerCard}>
                    <View style={styles.offerBody}>
                      <Text style={styles.kindChip}>
                        {suggestionKindLabel(locale, s.kind)}
                      </Text>
                      <Text style={styles.offerTitle}>{s.title}</Text>
                      <View style={styles.offerMeta}>
                        {s.priceHint ? (
                          <View style={styles.priceRail}>
                            <Text style={styles.priceLabel}>
                              {t(locale, "planner.booking.priceLabel")}
                            </Text>
                            <Text style={styles.priceValue}>{s.priceHint}</Text>
                          </View>
                        ) : null}
                        {typeof s.ratingHint === "number" ? (
                          <Text style={styles.rating}>
                            ★ {s.ratingHint.toFixed(1)}
                          </Text>
                        ) : null}
                        <Text style={styles.provider}>{s.providerLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.offerActions}>
                      <Pressable
                        style={styles.openBtn}
                        onPress={() => openExternal(s.url)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.openBtnLabel}>
                          {t(locale, "planner.booking.openExternal")}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.pinBtn}
                        onPress={() => applySuggestion(s)}
                        accessibilityRole="button"
                        disabled={!stop}
                      >
                        <Text
                          style={StyleSheet.flatten([
                            styles.pinBtnLabel,
                            !stop ? styles.pinBtnLabelMuted : null,
                          ])}
                        >
                          {t(locale, "planner.booking.useLink")}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {!searching && !searched ? (
              <Text style={styles.sectionSupport}>
                {t(locale, "planner.booking.suggestSupport")}
              </Text>
            ) : null}
          </View>

          {/* Pinned */}
          <View
            style={styles.pinnedSection}
            accessibilityLabel={t(locale, "planner.booking.linksEyebrow")}
          >
            <Text style={styles.sectionEyebrow}>
              {t(locale, "planner.booking.linksEyebrow")}
            </Text>
            <Text style={styles.pinnedTitle}>
              {t(locale, "planner.booking.linksTitle")}
            </Text>

            {!stop ? (
              <Text style={styles.sectionSupport}>
                {t(locale, "planner.booking.selectStop")}
              </Text>
            ) : (
              <View style={styles.draftList}>
                {drafts.map((row) => (
                  <View key={row.kind} style={styles.draftCard}>
                    <View style={styles.draftHead}>
                      <Text style={styles.draftKind}>
                        {t(locale, `planner.booking.kind.${row.kind}`)}
                      </Text>
                      {row.url.trim() ? (
                        <Pressable
                          style={styles.openChip}
                          onPress={() => openExternal(row.url.trim())}
                          accessibilityRole="button"
                        >
                          <Text style={styles.openChipLabel}>
                            {t(locale, "planner.booking.open")}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <TextInput
                      value={row.providerLabel}
                      onChangeText={(v) =>
                        updateDraft(row.kind, { providerLabel: v })
                      }
                      placeholder={t(
                        locale,
                        "planner.booking.providerPlaceholder",
                      )}
                      placeholderTextColor="rgba(100,116,139,0.5)"
                      style={styles.input}
                    />
                    <TextInput
                      value={row.url}
                      onChangeText={(v) => updateDraft(row.kind, { url: v })}
                      placeholder={t(locale, "planner.booking.urlPlaceholder")}
                      placeholderTextColor="rgba(100,116,139,0.5)"
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ))}
                <Pressable
                  style={StyleSheet.flatten([
                    styles.saveBtn,
                    saving ? styles.searchBtnBusy : null,
                  ])}
                  disabled={saving}
                  onPress={() => void save()}
                  accessibilityRole="button"
                >
                  <Text style={styles.saveBtnLabel}>
                    {saving
                      ? t(locale, "planner.booking.saving")
                      : t(locale, "planner.booking.save")}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={styles.hint}>{t(locale, "planner.booking.hint")}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 12,
    marginBottom: 4,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  headerTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  headerEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
  },
  headerTitle: {
    ...type.display,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  badge: {
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeDemo: {
    backgroundColor: colors.mist,
  },
  badgeLive: {
    backgroundColor: "rgba(47,107,255,0.12)",
  },
  badgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  badgeTextDemo: {
    color: colors.inkSoft,
  },
  badgeTextLive: {
    color: colors.riverDeep,
  },
  headerSupport: {
    ...type.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkSoft,
  },
  chevron: {
    ...type.body,
    fontSize: 16,
    color: colors.river,
  },
  chevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  body: {
    gap: 0,
  },
  softFail: {
    marginHorizontal: 14,
    marginTop: 14,
  },
  section: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 8,
  },
  sectionEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  sectionTitle: {
    ...type.display,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  sectionSupport: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  filterChip: {
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipOn: {
    backgroundColor: colors.river,
  },
  filterChipOff: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47,107,255,0.2)",
    backgroundColor: "rgba(47,107,255,0.05)",
  },
  filterChipText: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
  },
  filterChipTextOn: {
    color: colors.foam,
  },
  filterChipTextOff: {
    color: colors.inkSoft,
  },
  fieldGrid: {
    gap: 10,
    marginTop: 4,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  input: {
    ...type.body,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  searchBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: colors.river,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: colors.river,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  searchBtnBusy: {
    opacity: 0.45,
  },
  searchBtnLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
  },
  loadingBlock: {
    gap: 8,
    marginTop: 4,
  },
  skeletonCard: {
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: "rgba(230,236,245,0.85)",
  },
  loadingHint: {
    ...type.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  emptyResults: {
    ...type.display,
    marginTop: 4,
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  resultsList: {
    gap: 10,
    marginTop: 4,
  },
  resultsCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  offerCard: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.45)",
    backgroundColor: colors.foam,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  offerBody: {
    gap: 6,
  },
  kindChip: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47,107,255,0.2)",
    backgroundColor: "rgba(47,107,255,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.riverDeep,
    ...type.body,
  },
  offerTitle: {
    ...type.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  offerMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  priceRail: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    borderRadius: radius.xs,
    backgroundColor: "rgba(47,107,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
  },
  priceLabel: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(47,107,255,0.75)",
  },
  priceValue: {
    ...type.display,
    fontSize: 15,
    fontWeight: "800",
    color: colors.river,
  },
  rating: {
    ...type.body,
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
  },
  provider: {
    ...type.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  offerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  openBtn: {
    backgroundColor: colors.river,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  openBtnLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 13,
    fontWeight: "700",
  },
  pinBtn: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  pinBtnLabel: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  pinBtnLabelMuted: {
    color: colors.inkSoft,
    opacity: 0.55,
  },
  pinnedSection: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: "rgba(244,246,250,0.45)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    gap: 8,
  },
  pinnedTitle: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  draftList: {
    gap: 10,
    marginTop: 4,
  },
  draftCard: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.4)",
    backgroundColor: "rgba(255,255,255,0.8)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  draftHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  draftKind: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  openChip: {
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47,107,255,0.35)",
    backgroundColor: "rgba(47,107,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  openChipLabel: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    color: colors.river,
  },
  saveBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.river,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: colors.river,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  saveBtnLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
  },
  hint: {
    ...type.body,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(71,85,105,0.8)",
  },
});
