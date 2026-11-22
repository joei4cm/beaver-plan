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
import { SheetPresence } from "./sheet-presence";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashStyle,
} from "./soft-fail-notice";

type Props = {
  tripId: string;
  locale: Locale;
  trip: Trip;
  stop: Stop | null;
  destinationHint?: string;
  onSaved: (stop: Stop) => void;
  defaultOpen?: boolean;
  /** Craft SoftFail query: `/trips/…?otaSoftFail=1` (BEA-418 / #282 parity). */
  craftOtaSoftFail?: boolean;
  /** Craft SoftFail query: `/trips/…?confirmSoftFail=1` (BEA-418 / #282 parity). */
  craftConfirmSoftFail?: boolean;
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
 * Expo booking OTA sheet — SoftFail depth kept (BEA-389 / BEA-349 / BEA-418) +
 * wave 48 craft residual (BEA-460): root / confirmRail soft elevation ·
 * offerCard `--bp-line` + soft shadow · offerTitle display 14.
 * Wave 50 Confirm residual (BEA-481): tip-011 press on Confirm save / open
 * chip · draftKind tracking 1.4 (web `0.14em`). Wave 52 (BEA-502): tip-011
 * press on OTA Search / Open / Use link (reuse `ctaPressed`). Wave 63
 * (BEA-613): headerEyebrow letterSpacing 1.8 · header/loading/empty meta
 * inkSoft@CC (day-fill #408 twin) · skeleton SheetPresence `80+i*40` / rise 8
 * twin of live offers (#425 pattern). Wave 64 (BEA-618): emptyResults
 * lineHeight 22. Wave 65 (BEA-642): headerTitle LH 24 · sectionTitle LH 22 ·
 * offerTitle LH 20 (day-fill title / prefsTitle / web offer snug twin). SoftFail
 * stays under OTA / Confirm rails; craft `?otaSoftFail=1` /
 * `?confirmSoftFail=1`. Confirm SoftFail yields OTA (no double depth). Never
 * timber / Failed to fetch. No `/dev` gallery.
 */
export function BookingPanel({
  tripId,
  locale,
  trip,
  stop,
  destinationHint,
  onSaved,
  defaultOpen = false,
  craftOtaSoftFail = false,
  craftConfirmSoftFail = false,
}: Props) {
  const [open, setOpen] = useState(() => Boolean(stop) || defaultOpen);
  const [drafts, setDrafts] = useState<DraftRow[]>(() => draftsFromStop(stop));
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<BookingSuggestion[]>([]);
  const [statusMode, setStatusMode] = useState<"demo" | "configured">("demo");
  const [softDemo, setSoftDemo] = useState(false);
  /** Save soft-fail stays under the Confirm rail — never timber Failed to fetch. */
  const [confirmSoftFail, setConfirmSoftFail] = useState(false);
  /**
   * Craft SoftFail query parity with web (`?otaSoftFail=1`) — prefer Expo
   * Router param from trip detail (#282); fall back to window search (Expo web).
   */
  const [windowOtaSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("otaSoftFail") === "1"
      );
    } catch {
      return false;
    }
  });
  /**
   * Craft SoftFail query parity with web (`?confirmSoftFail=1`) — prefer Expo
   * Router param from trip detail (#282); fall back to window search (Expo web).
   */
  const [windowConfirmSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("confirmSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  const otaSoftPreview = craftOtaSoftFail || windowOtaSoftPreview;
  const confirmSoftPreview =
    craftConfirmSoftFail || windowConfirmSoftPreview;
  const stopIdRef = useRef(stop?.id);
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

  // Clear Confirm SoftFail only when stop *identity* changes — keep it after
  // soft-fail local apply (same id). Craft `?confirmSoftFail=1` uses
  // confirmSoftPreview and is not cleared here.
  useEffect(() => {
    if (stopIdRef.current === stop?.id) return;
    stopIdRef.current = stop?.id;
    setConfirmSoftFail(false);
  }, [stop?.id]);

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

  const pendingCount = useMemo(
    () => drafts.filter((d) => d.url.trim()).length,
    [drafts],
  );

  const isDirty = useMemo(() => {
    const baseline = draftsFromStop(stop);
    return BOOKING_LINK_KINDS.some((kind) => {
      const draft = drafts.find((d) => d.kind === kind)!;
      const saved = baseline.find((d) => d.kind === kind)!;
      return (
        draft.url.trim() !== saved.url.trim() ||
        draft.providerLabel.trim() !== saved.providerLabel.trim()
      );
    });
  }, [drafts, stop]);

  function updateDraft(
    kind: BookingLinkKind,
    patch: Partial<Omit<DraftRow, "kind">>,
  ) {
    setConfirmSoftFail(false);
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
      setConfirmSoftFail(false);
      onSaved(res.stop);
    } catch {
      // Confirm-rail SoftFailNotice only — never surface timber "Failed to fetch".
      // Any save failure soft-fails under azure Confirm rail (noise / refused / CORS).
      setConfirmSoftFail(true);
      applyLocalStop(bookingLinks);
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
  /**
   * OTA SoftFail helpers (BEA-389 after #284 / depth BEA-349) + craft SoftFail
   * query parity (BEA-418): SoftFailBadge · SoftFailSupport · SoftFailNotice
   * mist band · softFailMistWashStyle tip-011 · StyleSheet.flatten. Craft:
   * /trips/…?otaSoftFail=1 forces softFail under OTA. Confirm SoftFail owns
   * save soft-fail so OTA SoftFail yields (no double depth). SoftFail copy
   * never timber / Failed to fetch.
   */
  const softFailCopy = t(locale, "planner.booking.softFail");
  const softCopy = otaSoftPreview
    ? softFailCopy
    : softDemo
      ? softFailCopy
      : statusMode === "demo"
        ? t(locale, "planner.booking.demoNotice")
        : null;
  const badge = isConfigured
    ? t(locale, "planner.booking.configuredBadge")
    : t(locale, "planner.booking.demoBadge");
  const offerCountLabel = t(locale, "planner.booking.offerCount").replace(
    "{n}",
    String(suggestions.length),
  );

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

  /**
   * Confirm SoftFail helpers (BEA-389 after #284 / depth BEA-340) + craft
   * SoftFail query parity (BEA-418): SoftFailBadge · SoftFailSupport ·
   * SoftFailNotice mist band · softFailMistWashStyle tip-011. Craft:
   * /trips/…?confirmSoftFail=1 — SoftFail depth under Confirm without a save
   * miss. SoftFail copy never timber / Failed to fetch.
   */
  const showConfirmSoftFail = confirmSoftPreview || confirmSoftFail;
  const showOtaSoftFail = Boolean(softCopy) && !showConfirmSoftFail;
  const sheetSupportCopy = showOtaSoftFail
    ? t(locale, "planner.booking.softSupport")
    : stop
      ? t(locale, "planner.booking.forStop").replace(
          "{name}",
          stop.place.name,
        )
      : t(locale, "planner.booking.support");
  /** Confirm SoftFail copy owned by azure Confirm rail — never inherit timber. */
  const confirmSoftCopy = t(locale, "planner.booking.confirmSoftFail");
  const confirmSupportCopy = showConfirmSoftFail
    ? t(locale, "planner.booking.confirmSoftSupport")
    : t(locale, "planner.booking.confirmSupport");

  return (
    <View
      style={styles.root}
      accessibilityLabel={t(locale, "planner.booking.title")}
    >
      {/*
        OTA SoftFail helpers (BEA-389 after #284) + craft SoftFail query parity
        (BEA-418): SoftFailBadge · SoftFailSupport · soft rail wash · tip-011.
        Craft: ?otaSoftFail=1 — Confirm SoftFail owns save soft-fail.
      */}
      <Pressable
        style={StyleSheet.flatten([
          styles.header,
          showOtaSoftFail ? styles.headerSoft : null,
        ])}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerEyebrow}>
              {t(locale, "planner.booking.sheetEyebrow")}
            </Text>
            <Text style={styles.headerTitle}>
              {t(locale, "planner.booking.title")}
            </Text>
            {isConfigured ? (
              <SoftFailLiveBadge>{badge}</SoftFailLiveBadge>
            ) : (
              <SoftFailBadge>{badge}</SoftFailBadge>
            )}
            {showOtaSoftFail ? (
              <SoftFailBadge>
                {t(locale, "planner.booking.otaSoftBadge")}
              </SoftFailBadge>
            ) : null}
            {suggestions.length > 0 ? (
              <Text style={styles.headerCount}>{offerCountLabel}</Text>
            ) : savedCount > 0 ? (
              <Text style={styles.headerCount}>
                {t(locale, "planner.booking.savedCount").replace(
                  "{n}",
                  String(savedCount),
                )}
              </Text>
            ) : null}
          </View>
          {showOtaSoftFail ? (
            <SoftFailSupport>{sheetSupportCopy}</SoftFailSupport>
          ) : (
            <Text style={styles.headerSupport}>{sheetSupportCopy}</Text>
          )}
        </View>
        <Text style={StyleSheet.flatten([styles.chevron, open && styles.chevronOpen])}>
          ▾
        </Text>
      </Pressable>

      {open ? (
        <Animated.View
          style={StyleSheet.flatten([
            styles.body,
            showOtaSoftFail ? softFailMistWashStyle : null,
            bodyStyle,
          ])}
        >
          {/* Compact SoftFail mist band under azure OTA rail — Confirm SoftFail yields. */}
          <SoftFailNotice open={showOtaSoftFail} compact>
            {softCopy ?? ""}
          </SoftFailNotice>

          {/* Search — mist-track filters · city / dates · azure CTA · tip-011 */}
          <SheetPresence
            open={open}
            delayMs={50}
            rise={10}
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

            <View style={styles.filterBlock}>
              <Text style={styles.fieldLabel}>
                {t(locale, "planner.booking.filterLabel")}
              </Text>
              <View
                style={styles.mistTrack}
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
                        on ? styles.filterChipOn : null,
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
              style={({ pressed }) =>
                StyleSheet.flatten([
                  styles.searchBtn,
                  searching ? styles.searchBtnBusy : null,
                  pressed && !searching ? styles.ctaPressed : null,
                ])
              }
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
          </SheetPresence>

          {/* Results — ranked offers · empty ladder · tip-011 */}
          <SheetPresence
            open={open}
            delayMs={70}
            rise={10}
            style={styles.section}
            accessibilityLabel={t(locale, "planner.booking.resultsEyebrow")}
          >
            <View style={styles.resultsHead}>
              <Text style={styles.sectionEyebrow}>
                {t(locale, "planner.booking.resultsEyebrow")}
              </Text>
              {suggestions.length > 0 && !searching ? (
                <>
                  <Text style={styles.sectionTitle}>
                    {t(locale, "planner.booking.resultsTitle").replace(
                      "{n}",
                      String(suggestions.length),
                    )}
                  </Text>
                  <Text style={styles.sectionSupport}>
                    {t(locale, "planner.booking.resultsSupport")}
                  </Text>
                </>
              ) : null}
            </View>

            {searching ? (
              <SheetPresence
                open={open}
                delayMs={60}
                rise={8}
                style={styles.loadingBlock}
              >
                {[0, 1].map((i) => (
                  <SheetPresence
                    key={i}
                    open={open}
                    delayMs={80 + i * 40}
                    rise={8}
                  >
                    <View style={styles.skeletonCard} />
                  </SheetPresence>
                ))}
                <Text style={styles.loadingHint}>
                  {t(locale, "planner.booking.loadingHint")}
                </Text>
              </SheetPresence>
            ) : null}

            {!searching && searched && suggestions.length === 0 ? (
              <SheetPresence
                open={open}
                delayMs={70}
                rise={8}
                style={styles.emptyLadder}
              >
                <Text style={styles.emptyEyebrow}>
                  {t(locale, "planner.booking.emptyEyebrow")}
                </Text>
                <Text style={styles.emptyResults}>
                  {t(locale, "planner.booking.emptyResults")}
                </Text>
                <Text style={styles.emptyHint}>
                  {t(locale, "planner.booking.emptyHint")}
                </Text>
              </SheetPresence>
            ) : null}

            {!searching && suggestions.length > 0 ? (
              <View style={styles.resultsList}>
                {suggestions.map((s, i) => (
                  <SheetPresence
                    key={s.id}
                    open={open}
                    delayMs={80 + i * 40}
                    rise={8}
                    style={styles.offerCard}
                  >
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
                        style={({ pressed }) =>
                          StyleSheet.flatten([
                            styles.openBtn,
                            pressed ? styles.ctaPressed : null,
                          ])
                        }
                        onPress={() => openExternal(s.url)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.openBtnLabel}>
                          {t(locale, "planner.booking.openExternal")}
                        </Text>
                      </Pressable>
                      {stop ? (
                        <Pressable
                          style={({ pressed }) =>
                            StyleSheet.flatten([
                              styles.pinBtn,
                              pressed ? styles.ctaPressed : null,
                            ])
                          }
                          onPress={() => applySuggestion(s)}
                          accessibilityRole="button"
                        >
                          <Text style={styles.pinBtnLabel}>
                            {t(locale, "planner.booking.useLink")}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </SheetPresence>
                ))}
              </View>
            ) : null}

            {!searching && !searched ? (
              <SheetPresence
                open={open}
                delayMs={70}
                rise={8}
                style={styles.emptyLadder}
              >
                <Text style={styles.emptyEyebrow}>
                  {t(locale, "planner.booking.emptyEyebrow")}
                </Text>
                <Text style={styles.sectionSupport}>
                  {t(locale, "planner.booking.suggestSupport")}
                </Text>
              </SheetPresence>
            ) : null}
          </SheetPresence>

          {/*
            Confirm SoftFail helpers (BEA-389 after #284 / depth BEA-340) + craft
            SoftFail query parity (BEA-418): SoftFailBadge · SoftFailSupport ·
            SoftFailNotice mist band · softFailMistWashStyle tip-011. Craft:
            ?confirmSoftFail=1 — never timber / Failed to fetch. OTA SoftFail
            yields while Confirm owns soft-fail.
          */}
          <SheetPresence
            open={open}
            delayMs={90}
            rise={10}
            style={styles.confirmSection}
            accessibilityLabel={t(locale, "planner.booking.confirmEyebrow")}
          >
            <View style={styles.confirmRail}>
              <View
                style={StyleSheet.flatten([
                  styles.confirmHeader,
                  showConfirmSoftFail ? styles.confirmHeaderSoft : null,
                ])}
              >
                <View style={styles.confirmHeaderText}>
                  <View style={styles.confirmChipRow}>
                    <Text style={styles.sectionEyebrow}>
                      {t(locale, "planner.booking.confirmEyebrow")}
                    </Text>
                    {pendingCount > 0 ? (
                      <View style={styles.pendingChip}>
                        <Text style={styles.pendingChipLabel}>
                          {t(locale, "planner.booking.confirmPending").replace(
                            "{n}",
                            String(pendingCount),
                          )}
                        </Text>
                      </View>
                    ) : null}
                    {isDirty ? (
                      <View style={styles.dirtyChip}>
                        <Text style={styles.dirtyChipLabel}>
                          {t(locale, "planner.booking.confirmDirty")}
                        </Text>
                      </View>
                    ) : null}
                    {showConfirmSoftFail ? (
                      <SoftFailBadge>
                        {t(locale, "planner.booking.confirmSoftBadge")}
                      </SoftFailBadge>
                    ) : null}
                  </View>
                  <Text style={styles.confirmTitle}>
                    {t(locale, "planner.booking.confirmTitle")}
                  </Text>
                  {showConfirmSoftFail ? (
                    <SoftFailSupport style={styles.confirmSupportSoft}>
                      {confirmSupportCopy}
                    </SoftFailSupport>
                  ) : (
                    <Text style={styles.confirmSupport}>
                      {confirmSupportCopy}
                    </Text>
                  )}
                </View>
                {stop ? (
                  <Pressable
                    style={({ pressed }) =>
                      StyleSheet.flatten([
                        styles.saveBtn,
                        saving || !isDirty ? styles.searchBtnBusy : null,
                        pressed && !(saving || !isDirty)
                          ? styles.ctaPressed
                          : null,
                      ])
                    }
                    disabled={saving || !isDirty}
                    onPress={() => void save()}
                    accessibilityRole="button"
                  >
                    <Text style={styles.saveBtnLabel}>
                      {saving
                        ? t(locale, "planner.booking.saving")
                        : t(locale, "planner.booking.save")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Compact SoftFail mist band under azure Confirm rail — never timber. */}
              <SoftFailNotice open={showConfirmSoftFail} compact>
                {confirmSoftCopy}
              </SoftFailNotice>

              <SheetPresence
                open={open}
                delayMs={40}
                rise={8}
                style={StyleSheet.flatten([
                  styles.draftList,
                  showConfirmSoftFail ? softFailMistWashStyle : null,
                ])}
                accessibilityLabel={t(locale, "planner.booking.confirmTitle")}
              >
                {!stop ? (
                  <SheetPresence open={open} delayMs={55} rise={6}>
                    <Text style={styles.sectionSupport}>
                      {t(locale, "planner.booking.selectStop")}
                    </Text>
                  </SheetPresence>
                ) : (
                  drafts.map((row, i) => {
                    const filled = Boolean(row.url.trim());
                    return (
                      <SheetPresence
                        key={row.kind}
                        open={open}
                        delayMs={55 + i * 35}
                        rise={8}
                        style={StyleSheet.flatten([
                          styles.draftCard,
                          filled ? styles.draftCardFilled : styles.draftCardEmpty,
                        ])}
                      >
                        <View style={styles.draftHead}>
                          <Text style={styles.draftKind}>
                            {t(locale, `planner.booking.kind.${row.kind}`)}
                          </Text>
                          {filled ? (
                            <Pressable
                              style={({ pressed }) =>
                                StyleSheet.flatten([
                                  styles.openChip,
                                  pressed ? styles.chipPressed : null,
                                ])
                              }
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
                          style={styles.confirmInput}
                        />
                        <TextInput
                          value={row.url}
                          onChangeText={(v) =>
                            updateDraft(row.kind, { url: v })
                          }
                          placeholder={t(
                            locale,
                            "planner.booking.urlPlaceholder",
                          )}
                          placeholderTextColor="rgba(100,116,139,0.5)"
                          style={styles.confirmInput}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </SheetPresence>
                    );
                  })
                )}
              </SheetPresence>
            </View>
          </SheetPresence>

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
    shadowColor: colors.ink,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
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
  /** Soft azure OTA rail wash when SoftFail owns depth (BEA-349). */
  headerSoft: {
    backgroundColor: "rgba(244, 246, 250, 0.85)",
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
    /** Web sheet eyebrow 0.18em bar (BEA-613 / day-fill #408 twin). */
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  headerTitle: {
    ...type.display,
    fontSize: 18,
    /** Web sheet title leading-snug · day-fill title twin (BEA-642). */
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  headerCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: "rgba(100,116,139,0.8)",
  },
  headerSupport: {
    ...type.body,
    fontSize: 11,
    lineHeight: 16,
    /** Web sheet meta ink-soft/80 (BEA-613 / day-fill twin). */
    color: `${colors.inkSoft}CC`,
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
    /** Web section title leading-snug · day-fill prefsTitle twin (BEA-642). */
    lineHeight: 22,
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
  filterBlock: {
    gap: 8,
    marginTop: 4,
  },
  mistTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.55)",
    padding: 4,
  },
  filterChip: {
    borderRadius: radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipOn: {
    backgroundColor: colors.foam,
    shadowColor: colors.river,
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47,107,255,0.25)",
  },
  filterChipText: {
    ...type.body,
    fontSize: 13,
    fontWeight: "700",
  },
  filterChipTextOn: {
    color: colors.river,
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
  resultsHead: {
    gap: 4,
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
    lineHeight: 16,
    /** Web loadingHint ink-soft/80 (BEA-613 / day-fill twin). */
    color: `${colors.inkSoft}CC`,
  },
  emptyLadder: {
    gap: 6,
    marginTop: 4,
    maxWidth: 360,
  },
  emptyEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    /** Web empty-stage 0.18em bar (#351 / map search empty). */
    letterSpacing: 1.8,
    textTransform: "uppercase",
    /** Web text-river/80 */
    color: `${colors.river}CC`,
  },
  emptyResults: {
    ...type.display,
    fontSize: 17,
    /** Web emptyResults leading-snug · day-fill emptyTitle twin (BEA-618). */
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  emptyHint: {
    ...type.body,
    fontSize: 13,
    lineHeight: 19,
    /** Web emptyHint ink-soft/80 (BEA-613 / day-fill twin). */
    color: `${colors.inkSoft}CC`,
  },
  resultsList: {
    gap: 10,
    marginTop: 4,
  },
  offerCard: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
    shadowColor: colors.ink,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
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
    fontSize: 14,
    /** Web offer title leading-snug twin (BEA-642). */
    lineHeight: 20,
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
    borderColor: "rgba(47,107,255,0.35)",
    backgroundColor: colors.foam,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  pinBtnLabel: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
    color: colors.river,
  },
  confirmSection: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  confirmRail: {
    overflow: "hidden",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    shadowColor: colors.ink,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  confirmHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244,246,250,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  /** Soft azure Confirm rail wash when SoftFail owns depth (BEA-340). */
  confirmHeaderSoft: {
    backgroundColor: "rgba(244, 246, 250, 0.85)",
  },
  confirmHeaderText: {
    flex: 1,
    minWidth: 160,
    gap: 4,
  },
  confirmChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  pendingChip: {
    borderRadius: radius.xs,
    backgroundColor: "rgba(47,107,255,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
  },
  pendingChipLabel: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.riverDeep,
  },
  /** Foam dark residual (BEA-568): Soft-shaped mist chip — ink/70 + line ring parity SoftFail Soft badge. */
  dirtyChip: {
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dirtyChipLabel: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(15, 23, 42, 0.7)",
  },
  confirmTitle: {
    ...type.display,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  confirmSupport: {
    ...type.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkSoft,
    flexShrink: 1,
  },
  /** SoftFailSupport keeps flex shrink beside Confirm title while Soft owns. */
  confirmSupportSoft: {
    flexShrink: 1,
  },
  draftList: {
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  draftCard: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  draftCardFilled: {
    borderColor: "rgba(47,107,255,0.3)",
    backgroundColor: "rgba(47,107,255,0.04)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  draftCardEmpty: {
    borderColor: "rgba(148,163,184,0.4)",
    backgroundColor: "rgba(244,246,250,0.5)",
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
    letterSpacing: 1.4,
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
  /** tip-011 press — day-fill chip sibling (BEA-481). */
  chipPressed: {
    transform: [{ scale: 0.98 }],
  },
  openChipLabel: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    color: colors.river,
  },
  confirmInput: {
    ...type.body,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
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
  /** tip-011 press — day-fill CTA sibling (BEA-481). */
  ctaPressed: {
    transform: [{ scale: 0.98 }],
  },
  saveBtnLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  hint: {
    ...type.body,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(71,85,105,0.8)",
  },
});
