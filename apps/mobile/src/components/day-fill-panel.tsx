import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  DAY_FILL_INTERESTS,
  DEMO_PLACES,
  DemoDayFillProvider,
  materializeDayFill,
  tripDatesFromDays,
  type Day,
  type DayFillInterest,
  type DayFillProposal,
  type Stop,
  type Trip,
} from "@beaver/core";
import { colors, motion, radius } from "@beaver/ui-tokens";
import { t, type Locale, type MessageKey } from "@beaver/i18n";
import {
  applyDayFill,
  fetchDayFillStatus,
  isApiSoftFail,
  proposeDayFill,
} from "../api";
import { SheetPresence } from "./sheet-presence";
import { SoftFailNotice } from "./soft-fail-notice";
import { type } from "../theme";

type Props = {
  tripId: string;
  locale: Locale;
  trip: Trip;
  days: Day[];
  stops: Stop[];
  dayCountHint: number;
  onApplied: () => Promise<void>;
  onLocalApplied?: (next: {
    trip: Trip;
    days: Day[];
    stops: Stop[];
  }) => void;
  onError: (message: string) => void;
};

type StatusResponse = {
  mode: "live" | "demo";
  provider: string;
};

const DEFAULT_INTERESTS: DayFillInterest[] = ["temples", "food", "culture"];
const WALK_PRESETS = [30, 45, 60, 75, 90, 120, 150] as const;

const INTEREST_KEYS: Record<DayFillInterest, MessageKey> = {
  temples: "planner.dayFill.interest.temples",
  food: "planner.dayFill.interest.food",
  nature: "planner.dayFill.interest.nature",
  shopping: "planner.dayFill.interest.shopping",
  culture: "planner.dayFill.interest.culture",
  photo: "planner.dayFill.interest.photo",
};

const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildLocalDemoProposal(input: {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  interests: DayFillInterest[];
  walkMinutes: number;
  dayCount: number;
  locale: Locale;
}): Promise<DayFillProposal> {
  const provider = new DemoDayFillProvider();
  const result = await provider.propose({
    trip: input.trip,
    days: input.days,
    stops: input.stops,
    prefs: {
      interests: input.interests,
      maxWalkMinutesPerDay: input.walkMinutes,
      dayCount: input.dayCount,
    },
    catalog: DEMO_PLACES,
    locale: input.locale,
  });
  return {
    id: newId(),
    tripId: input.trip.id,
    mode: "demo",
    provider: provider.id,
    prefs: {
      interests: input.interests,
      maxWalkMinutesPerDay: input.walkMinutes,
      dayCount: input.dayCount,
    },
    rationale: result.rationale,
    days: result.days,
    createdAt: new Date().toISOString(),
  };
}

function SectionEyebrow({ children }: { children: string }) {
  return <Text style={styles.sectionEyebrow}>{children}</Text>;
}

/**
 * Expo smart day-fill SoftFailNotice depth (BEA-360 after #101 / web #248):
 * azure Day fill rail · Soft fill badge · softSupport · soft rail wash ·
 * compact SoftFail mist band · tip-011 SheetPresence mist-wash body ·
 * StyleSheet.flatten · Lumen tokens. SoftFail copy never timber /
 * Failed to fetch. Yields web planner day-fill SoftFail (#248); Expo day
 * tabs SoftFail (#230) stays on Days rail (no double depth).
 */
export function DayFillPanel({
  tripId,
  locale,
  trip,
  days,
  stops,
  dayCountHint,
  onApplied,
  onLocalApplied,
  onError,
}: Props) {
  const [open, setOpen] = useState(true);
  const [interests, setInterests] =
    useState<DayFillInterest[]>(DEFAULT_INTERESTS);
  const [walkMinutes, setWalkMinutes] = useState(60);
  const [dayCount, setDayCount] = useState(
    Math.max(1, Math.min(7, dayCountHint || 3)),
  );
  const [proposal, setProposal] = useState<DayFillProposal | null>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [softDemo, setSoftDemo] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bodyAnim = useRef(new Animated.Value(open ? 1 : 0)).current;
  const previewAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void fetchDayFillStatus()
      .then((res) => {
        if (!cancelled) {
          setStatus({ mode: res.mode, provider: res.provider });
          setSoftDemo(false);
          setNotice(
            res.mode === "demo" ? t(locale, "planner.dayFill.demoNotice") : null,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ mode: "demo", provider: "demo-day-fill" });
          setSoftDemo(true);
          setNotice(t(locale, "planner.dayFill.softFail"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    Animated.timing(bodyAnim, {
      toValue: open ? 1 : 0,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [open, bodyAnim]);

  useEffect(() => {
    if (!proposal || generating) {
      previewAnim.setValue(0);
      return;
    }
    previewAnim.setValue(0);
    Animated.timing(previewAnim, {
      toValue: 1,
      duration: motion.durationMdMs,
      easing: easeRise,
      useNativeDriver: true,
    }).start();
  }, [proposal, generating, previewAnim]);

  const toggleInterest = useCallback((id: DayFillInterest) => {
    setInterests((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }, []);

  async function generate() {
    setGenerating(true);
    setNotice(null);
    onError("");
    try {
      const res = await proposeDayFill({
        tripId,
        interests,
        maxWalkMinutesPerDay: walkMinutes,
        dayCount,
        locale,
      });
      setProposal(res.proposal);
      setLocalOnly(false);
      setSoftDemo(false);
      setStatus({ mode: res.proposal.mode, provider: res.proposal.provider });
      if (res.proposal.mode === "demo") {
        setNotice(t(locale, "planner.dayFill.demoNotice"));
      }
    } catch (e) {
      try {
        const draft = await buildLocalDemoProposal({
          trip,
          days,
          stops,
          interests,
          walkMinutes,
          dayCount,
          locale,
        });
        setProposal(draft);
        setLocalOnly(true);
        setSoftDemo(isApiSoftFail(e));
        setStatus({ mode: "demo", provider: draft.provider });
        setNotice(
          isApiSoftFail(e)
            ? t(locale, "planner.dayFill.softFail")
            : t(locale, "planner.dayFill.demoNotice"),
        );
        onError("");
      } catch {
        if (isApiSoftFail(e)) {
          setSoftDemo(true);
          setNotice(t(locale, "planner.dayFill.softFail"));
          onError("");
        } else {
          onError(e instanceof Error ? e.message : "day_fill_failed");
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  function applyLocally(draft: DayFillProposal) {
    if (!onLocalApplied) {
      setNotice(t(locale, "planner.dayFill.applySoftFail"));
      return;
    }
    const engine =
      trip.mapEngine === "amap" ||
      trip.mapEngine === "baidu" ||
      trip.mapEngine === "google"
        ? trip.mapEngine
        : "google";
    const { days: nextDays, stops: nextStops } = materializeDayFill({
      trip,
      proposal: draft,
      existingDays: days,
      engine,
      newId,
    });
    const dates = tripDatesFromDays(nextDays);
    onLocalApplied({
      trip: {
        ...trip,
        version: trip.version + 1,
        startDate: dates.startDate ?? trip.startDate,
        endDate: dates.endDate ?? trip.endDate,
        updatedAt: new Date().toISOString(),
      },
      days: nextDays,
      stops: nextStops,
    });
    setProposal(null);
    setLocalOnly(false);
    setNotice(t(locale, "planner.dayFill.appliedLocal"));
    onError("");
  }

  async function apply() {
    if (!proposal) return;
    setApplying(true);
    setNotice(null);
    onError("");
    try {
      if (localOnly) {
        applyLocally(proposal);
        return;
      }
      await applyDayFill({
        tripId,
        proposal,
        expectedVersion: trip.version,
      });
      setProposal(null);
      setLocalOnly(false);
      await onApplied();
    } catch (e) {
      if (isApiSoftFail(e)) {
        applyLocally(proposal);
      } else {
        onError(e instanceof Error ? e.message : "apply_failed");
      }
    } finally {
      setApplying(false);
    }
  }

  const mode = proposal?.mode ?? status?.mode ?? "demo";
  const demoMode = mode === "demo" || localOnly || softDemo;
  const badge =
    mode === "live"
      ? t(locale, "planner.dayFill.liveBadge")
      : t(locale, "planner.dayFill.demoBadge");
  /**
   * Day-fill SoftFailNotice depth (BEA-360 after #101 / web #248):
   * azure Day fill rail · Soft fill badge · softSupport · compact SoftFail
   * mist band (`border-b`) · tip-011 mist-wash body. SoftFail copy always
   * softFail / demoNotice / applySoftFail (never timber / Failed to fetch).
   * Expo day tabs SoftFail (#230) stays on Days — no double depth.
   */
  const softCopy =
    notice ??
    (softDemo
      ? t(locale, "planner.dayFill.softFail")
      : demoMode
        ? t(locale, "planner.dayFill.demoNotice")
        : null);
  const showSoftFail = Boolean(softCopy);
  const sheetSupportCopy = showSoftFail
    ? t(locale, "planner.dayFill.softSupport")
    : t(locale, "planner.dayFill.support");

  const bodyStyle = useMemo(
    () => ({
      opacity: bodyAnim,
      transform: [
        {
          translateY: bodyAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
          }),
        },
      ],
    }),
    [bodyAnim],
  );

  const previewStyle = useMemo(
    () => ({
      opacity: previewAnim,
      transform: [
        {
          translateY: previewAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [14, 0],
          }),
        },
      ],
    }),
    [previewAnim],
  );

  return (
    <View style={styles.root} accessibilityLabel={t(locale, "planner.dayFill.title")}>
      {/*
        Day-fill SoftFail depth (BEA-360 after #101):
        azure Day fill rail · Soft fill badge · softSupport · soft rail wash ·
        tip-011 — never timber / Failed to fetch. Yields web #248.
      */}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={StyleSheet.flatten([
          styles.header,
          showSoftFail ? styles.headerSoft : null,
        ])}
      >
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title}>{t(locale, "planner.dayFill.title")}</Text>
            <Text
              style={StyleSheet.flatten([
                styles.badge,
                mode === "live" ? styles.badgeLive : styles.badgeDemo,
              ])}
            >
              {badge}
            </Text>
            {showSoftFail ? (
              <View style={styles.softBadge}>
                <Text style={styles.softBadgeLabel}>
                  {t(locale, "planner.dayFill.softBadge")}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.support}>{sheetSupportCopy}</Text>
        </View>
        <Text
          style={StyleSheet.flatten([
            styles.chevron,
            open ? styles.chevronOpen : null,
          ])}
          accessibilityElementsHidden
        >
          ▾
        </Text>
      </Pressable>

      {open ? (
        <Animated.View
          style={StyleSheet.flatten([
            styles.body,
            showSoftFail ? styles.bodySoft : null,
            bodyStyle,
          ])}
        >
          {/* Compact SoftFail mist band under azure Day fill rail — never timber. */}
          <SoftFailNotice
            open={showSoftFail}
            compact
            style={styles.sheetSoftFail}
          >
            {softCopy ?? ""}
          </SoftFailNotice>

          <SheetPresence
            open={open}
            delayMs={50}
            rise={10}
            style={StyleSheet.flatten([
              styles.prefs,
              showSoftFail ? styles.prefsSoft : null,
            ])}
            accessibilityLabel={t(locale, "planner.dayFill.interests")}
          >
            <View>
              <SectionEyebrow>
                {t(locale, "planner.dayFill.prefsEyebrow")}
              </SectionEyebrow>
              <Text style={styles.prefsTitle}>
                {t(locale, "planner.dayFill.prefsTitle")}
              </Text>
            </View>

            <View>
              <Text style={styles.fieldLabel}>
                {t(locale, "planner.dayFill.interests")}
              </Text>
              <View
                style={styles.mistTrack}
                accessibilityRole="tablist"
                accessibilityLabel={t(locale, "planner.dayFill.interests")}
              >
                {DAY_FILL_INTERESTS.map((id) => {
                  const on = interests.includes(id);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => toggleInterest(id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={StyleSheet.flatten([
                        styles.interestChip,
                        on ? styles.interestChipOn : null,
                      ])}
                    >
                      <Text
                        style={StyleSheet.flatten([
                          styles.interestChipLabel,
                          on ? styles.interestChipLabelOn : null,
                        ])}
                      >
                        {t(locale, INTEREST_KEYS[id])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.prefsGrid}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {t(locale, "planner.dayFill.walk")}
                </Text>
                <View
                  style={styles.mistTrack}
                  accessibilityRole="tablist"
                  accessibilityLabel={t(locale, "planner.dayFill.walk")}
                >
                  {WALK_PRESETS.map((mins) => {
                    const on = walkMinutes === mins;
                    return (
                      <Pressable
                        key={mins}
                        onPress={() => setWalkMinutes(mins)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={StyleSheet.flatten([
                          styles.interestChip,
                          on ? styles.interestChipOn : null,
                        ])}
                      >
                        <Text
                          style={StyleSheet.flatten([
                            styles.interestChipLabel,
                            on ? styles.interestChipLabelOn : null,
                          ])}
                        >
                          {mins}
                          {t(locale, "planner.dayFill.minutes")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {t(locale, "planner.dayFill.days")}
                </Text>
                <TextInput
                  value={String(dayCount)}
                  onChangeText={(raw) => {
                    const n = Number(raw.replace(/[^\d]/g, ""));
                    if (!Number.isFinite(n)) return;
                    setDayCount(Math.max(1, Math.min(7, n || 1)));
                  }}
                  keyboardType="number-pad"
                  style={styles.daysInput}
                  accessibilityLabel={t(locale, "planner.dayFill.days")}
                />
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                disabled={generating || interests.length === 0}
                onPress={() => void generate()}
                accessibilityRole="button"
                style={StyleSheet.flatten([
                  styles.cta,
                  generating || interests.length === 0
                    ? styles.ctaDisabled
                    : null,
                ])}
              >
                {generating ? (
                  <ActivityIndicator color={colors.foam} size="small" />
                ) : null}
                <Text style={styles.ctaLabel}>
                  {generating
                    ? t(locale, "planner.dayFill.generating")
                    : t(locale, "planner.dayFill.generate")}
                </Text>
              </Pressable>
              {proposal ? (
                <Pressable
                  onPress={() => {
                    setProposal(null);
                    setLocalOnly(false);
                    if (softDemo) {
                      setNotice(t(locale, "planner.dayFill.softFail"));
                    } else if (status?.mode === "demo") {
                      setNotice(t(locale, "planner.dayFill.demoNotice"));
                    } else {
                      setNotice(null);
                    }
                  }}
                  accessibilityRole="button"
                  style={styles.discard}
                >
                  <Text style={styles.discardLabel}>
                    {t(locale, "planner.dayFill.discard")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </SheetPresence>

          {generating ? (
            <SheetPresence
              open={open}
              delayMs={70}
              rise={10}
              style={StyleSheet.flatten([
                styles.stage,
                showSoftFail ? styles.stageSoft : null,
              ])}
              accessibilityLabel={t(locale, "planner.dayFill.loadingHint")}
            >
              <View style={styles.loadingBlock} accessibilityRole="progressbar">
                <View style={styles.skeletonCard}>
                  <View style={styles.skeletonHeader}>
                    <View style={styles.skeletonEyebrow} />
                    <View style={styles.skeletonTitle} />
                    <View style={styles.skeletonLine} />
                  </View>
                  {Array.from({ length: dayCount }).map((_, i) => (
                    <View key={i} style={styles.skeletonDay}>
                      <View style={styles.skeletonDayTitle} />
                      <View style={styles.skeletonNote} />
                    </View>
                  ))}
                </View>
                <Text style={styles.loadingHint}>
                  {t(locale, "planner.dayFill.loadingHint")}
                </Text>
              </View>
            </SheetPresence>
          ) : null}

          {!proposal && !generating ? (
            <SheetPresence
              open={open}
              delayMs={70}
              rise={10}
              style={StyleSheet.flatten([
                styles.stage,
                showSoftFail ? styles.stageSoft : null,
              ])}
              accessibilityLabel={t(locale, "planner.dayFill.empty")}
            >
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {t(locale, "planner.dayFill.empty")}
                </Text>
                <Text style={styles.emptyHint}>
                  {t(locale, "planner.dayFill.emptyHint")}
                </Text>
              </View>
            </SheetPresence>
          ) : null}

          {proposal && !generating ? (
            <SheetPresence
              open={open}
              delayMs={70}
              rise={12}
              style={StyleSheet.flatten([
                styles.stage,
                showSoftFail ? styles.stageSoft : null,
              ])}
              accessibilityLabel={t(locale, "planner.dayFill.preview")}
            >
              <Animated.View
                style={StyleSheet.flatten([styles.preview, previewStyle])}
                accessibilityLabel={t(locale, "planner.dayFill.preview")}
              >
                <View style={styles.previewHeader}>
                  <View style={styles.previewHeaderText}>
                    <View style={styles.headerTitleRow}>
                      <SectionEyebrow>
                        {t(locale, "planner.dayFill.previewEyebrow")}
                      </SectionEyebrow>
                      <Text
                        style={StyleSheet.flatten([
                          styles.badge,
                          proposal.mode === "live"
                            ? styles.badgeLive
                            : styles.badgeDemo,
                        ])}
                      >
                        {proposal.mode === "live"
                          ? t(locale, "planner.dayFill.liveBadge")
                          : t(locale, "planner.dayFill.demoBadge")}
                      </Text>
                    </View>
                    <Text style={styles.prefsTitle}>
                      {t(locale, "planner.dayFill.preview")}
                    </Text>
                    {proposal.rationale ? (
                      <Text style={styles.rationale}>{proposal.rationale}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    disabled={applying}
                    onPress={() => void apply()}
                    accessibilityRole="button"
                    style={StyleSheet.flatten([
                      styles.cta,
                      applying ? styles.ctaDisabled : null,
                    ])}
                  >
                    <Text style={styles.ctaLabel}>
                      {applying
                        ? t(locale, "planner.dayFill.applying")
                        : t(locale, "planner.dayFill.apply")}
                    </Text>
                  </Pressable>
                </View>

                {proposal.days.map((day) => (
                  <View key={day.dayIndex} style={styles.dayBlock}>
                    <View style={styles.dayHead}>
                      <Text style={styles.dayTitle}>
                        {t(locale, "planner.day")} {day.dayIndex + 1}
                        {day.date ? (
                          <Text style={styles.dayDate}> {day.date}</Text>
                        ) : null}
                      </Text>
                      {day.note ? (
                        <Text style={styles.dayNote}>{day.note}</Text>
                      ) : null}
                    </View>
                    <View style={styles.stopList}>
                      {day.stops.map((stop, i) => (
                        <View
                          key={`${stop.place.enginePlaceId}-${i}`}
                          style={styles.stopRow}
                        >
                          <View style={styles.stopMarker}>
                            <Text style={styles.stopMarkerLabel}>{i + 1}</Text>
                          </View>
                          <View style={styles.stopBody}>
                            <Text style={styles.stopName} numberOfLines={1}>
                              {stop.place.name}
                            </Text>
                            {typeof stop.estimatedWalkMinutes === "number" &&
                            stop.estimatedWalkMinutes > 0 ? (
                              <Text style={styles.stopWalk}>
                                {t(locale, "planner.dayFill.stopWalk")}{" "}
                                {stop.estimatedWalkMinutes}
                                {t(locale, "planner.dayFill.minutes")}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ))}
                      {day.stops.length === 0 ? (
                        <Text style={styles.noStops}>
                          {t(locale, "planner.dayFill.noStops")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Animated.View>
            </SheetPresence>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(248, 250, 252, 0.92)",
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.55)",
  },
  /** Soft azure Day fill rail wash when SoftFail owns depth (BEA-360). */
  headerSoft: {
    backgroundColor: "rgba(244, 246, 250, 0.85)",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  title: {
    ...type.display,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  badge: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    overflow: "hidden",
    borderRadius: radius.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeLive: {
    backgroundColor: "rgba(47, 107, 255, 0.12)",
    color: colors.riverDeep,
  },
  badgeDemo: {
    backgroundColor: colors.mist,
    color: colors.inkSoft,
  },
  softBadge: {
    borderRadius: radius.xs,
    backgroundColor: colors.mist,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  softBadgeLabel: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  support: {
    ...type.body,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
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
  /** Mist-wash tip-011 sheet body when SoftFail owns the Day fill rail. */
  bodySoft: {
    backgroundColor: "rgba(230, 236, 245, 0.22)",
  },
  /** Mist SoftFail strip under azure Day fill rail — border-b before tip-011 body. */
  sheetSoftFail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderTopWidth: 0,
  },
  prefs: {
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  /** tip-011 mist wash on prefs while SoftFail owns the rail. */
  prefsSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.18)",
  },
  stage: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  stageSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.12)",
  },
  sectionEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  prefsTitle: {
    ...type.display,
    marginTop: 4,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  fieldLabel: {
    ...type.body,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  mistTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    borderRadius: radius.sm,
    backgroundColor: "rgba(230, 236, 245, 0.55)",
    padding: 4,
  },
  interestChip: {
    borderRadius: radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  interestChipOn: {
    backgroundColor: colors.river,
    shadowColor: colors.river,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  interestChipLabel: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  interestChipLabelOn: {
    color: colors.foam,
  },
  prefsGrid: {
    gap: 14,
  },
  field: {
    gap: 0,
  },
  daysInput: {
    ...type.body,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.85)",
    color: colors.ink,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: 120,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingTop: 2,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.river,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: colors.river,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaLabel: {
    ...type.body,
    color: colors.foam,
    fontSize: 14,
    fontWeight: "700",
  },
  discard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  discardLabel: {
    ...type.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  loadingBlock: {
    gap: 10,
  },
  skeletonCard: {
    overflow: "hidden",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
  },
  skeletonHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  skeletonEyebrow: {
    width: 56,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(47, 107, 255, 0.18)",
  },
  skeletonTitle: {
    width: 112,
    height: 14,
    borderRadius: 4,
    backgroundColor: "rgba(15, 23, 42, 0.1)",
  },
  skeletonLine: {
    width: "72%",
    height: 10,
    borderRadius: 4,
    backgroundColor: "rgba(15, 23, 42, 0.07)",
  },
  skeletonDay: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  skeletonDayTitle: {
    width: 96,
    height: 12,
    borderRadius: 4,
    backgroundColor: "rgba(15, 23, 42, 0.1)",
  },
  skeletonNote: {
    width: 120,
    height: 18,
    borderRadius: radius.xs,
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  loadingHint: {
    ...type.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
  empty: {
    maxWidth: 360,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  emptyTitle: {
    ...type.display,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  emptyHint: {
    ...type.body,
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  preview: {
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
  previewHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  previewHeaderText: {
    flex: 1,
    minWidth: 180,
  },
  rationale: {
    ...type.body,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  dayBlock: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  dayHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  dayTitle: {
    ...type.display,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.15,
    color: colors.ink,
  },
  dayDate: {
    ...type.body,
    fontSize: 13,
    fontWeight: "400",
    color: colors.inkSoft,
  },
  dayNote: {
    ...type.body,
    maxWidth: "100%",
    overflow: "hidden",
    borderRadius: radius.xs,
    backgroundColor: "rgba(47, 107, 255, 0.1)",
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: "700",
    color: colors.river,
  },
  stopList: {
    marginTop: 10,
    gap: 8,
  },
  stopRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  stopMarker: {
    marginTop: 1,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(47, 107, 255, 0.12)",
  },
  stopMarkerLabel: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    color: colors.riverDeep,
  },
  stopBody: {
    flex: 1,
    minWidth: 0,
  },
  stopName: {
    ...type.body,
    fontSize: 14,
    color: colors.ink,
  },
  stopWalk: {
    ...type.body,
    marginTop: 2,
    fontSize: 12,
    color: colors.inkSoft,
  },
  noStops: {
    ...type.body,
    fontSize: 12,
    color: colors.inkSoft,
  },
});
