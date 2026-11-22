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
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashStyle,
} from "./soft-fail-notice";
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
  /** Craft SoftFail query: `/trips/…?dayFillSoftFail=1` (BEA-408 / #282 parity). */
  craftSoftFail?: boolean;
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
 * Expo day-fill sheet — SoftFail depth kept (BEA-360 / BEA-400 / BEA-408) +
 * wave 48–56 (#340/#367/#387) + wave 60 craft residual (BEA-576): header
 * eyebrow 1.8 · daysInput paper/80 · day SheetPresence stagger · support
 * ladder inkSoft/80. SoftFailBadge · SoftFailSupport · mist band unchanged.
 * SoftFail copy never timber / Failed to fetch. Yields web #248; Expo day
 * tabs SoftFail (#230) stays on Days. No `/dev` gallery.
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
  craftSoftFail = false,
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
  /**
   * Craft SoftFail query parity with web (`?dayFillSoftFail=1`) — prefer Expo
   * Router param from trip detail (#282); fall back to window search (Expo web).
   */
  const [windowDayFillSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("dayFillSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  const dayFillSoftPreview = craftSoftFail || windowDayFillSoftPreview;
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
   * SoftFail depth kept (BEA-360 / BEA-400 / BEA-408) — SoftFailBadge Soft
   * fill · SoftFailSupport · compact mist band · tip-011 wash. Craft:
   * ?dayFillSoftFail=1. Expo day tabs SoftFail (#230) stays on Days.
   */
  const softFailCopy = t(locale, "planner.dayFill.softFail");
  const softCopy = dayFillSoftPreview
    ? softFailCopy
    : (notice ??
      (softDemo
        ? softFailCopy
        : demoMode
          ? t(locale, "planner.dayFill.demoNotice")
          : null));
  const showSoftFail = Boolean(softCopy);
  const sheetSupportCopy = showSoftFail
    ? t(locale, "planner.dayFill.softSupport")
    : t(locale, "planner.dayFill.support");
  const dayCountLabel = t(locale, "planner.dayFill.dayCount").replace(
    "{n}",
    String(dayCount),
  );

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
        Day-fill SoftFail kept (BEA-360 / BEA-400 / BEA-408) + wave 48–56 +
        wave 60 craft (BEA-576): azure Day fill rail · header eyebrow 1.8 ·
        paper/70 · support inkSoft/80 · SoftFailBadge Soft fill · SoftFailSupport ·
        softFailMistWash tip-011 — craft ?dayFillSoftFail=1. Never timber.
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
            <Text style={styles.headerEyebrow}>
              {t(locale, "planner.dayFill.sheetEyebrow")}
            </Text>
            <Text style={styles.title}>
              {t(locale, "planner.dayFill.title")}
            </Text>
            {mode === "live" ? (
              <SoftFailLiveBadge>{badge}</SoftFailLiveBadge>
            ) : (
              <SoftFailBadge>{badge}</SoftFailBadge>
            )}
            {showSoftFail ? (
              <SoftFailBadge>
                {t(locale, "planner.dayFill.softBadge")}
              </SoftFailBadge>
            ) : null}
            <Text style={styles.headerCount}>{dayCountLabel}</Text>
          </View>
          {showSoftFail ? (
            <SoftFailSupport>{sheetSupportCopy}</SoftFailSupport>
          ) : (
            <Text style={styles.support}>{sheetSupportCopy}</Text>
          )}
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
            showSoftFail ? softFailMistWashStyle : null,
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
            style={styles.prefs}
            accessibilityLabel={t(locale, "planner.dayFill.interests")}
          >
            <View>
              <SectionEyebrow>
                {t(locale, "planner.dayFill.prefsEyebrow")}
              </SectionEyebrow>
              <Text style={styles.prefsTitle}>
                {t(locale, "planner.dayFill.prefsTitle")}
              </Text>
              <Text style={styles.prefsSupport}>
                {t(locale, "planner.dayFill.prefsSupport")}
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
                      style={({ pressed }) =>
                        StyleSheet.flatten([
                          styles.interestChip,
                          on ? styles.interestChipOn : null,
                          pressed ? styles.chipPressed : null,
                        ])
                      }
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
                        style={({ pressed }) =>
                          StyleSheet.flatten([
                            styles.interestChip,
                            on ? styles.interestChipOn : null,
                            pressed ? styles.chipPressed : null,
                          ])
                        }
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
                accessibilityLabel={
                  generating
                    ? t(locale, "planner.dayFill.generating")
                    : t(locale, "planner.dayFill.generate")
                }
                style={({ pressed }) =>
                  StyleSheet.flatten([
                    styles.cta,
                    generating || interests.length === 0
                      ? styles.ctaDisabled
                      : null,
                    pressed && !(generating || interests.length === 0)
                      ? styles.ctaPressed
                      : null,
                  ])
                }
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
                  accessibilityLabel={t(locale, "planner.dayFill.discard")}
                  style={({ pressed }) =>
                    StyleSheet.flatten([
                      styles.discard,
                      pressed ? styles.discardPressed : null,
                    ])
                  }
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
                <Text style={styles.emptyEyebrow}>
                  {t(locale, "planner.dayFill.emptyEyebrow")}
                </Text>
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
                      {proposal.mode === "live" ? (
                        <SoftFailLiveBadge>
                          {t(locale, "planner.dayFill.liveBadge")}
                        </SoftFailLiveBadge>
                      ) : (
                        <SoftFailBadge>
                          {t(locale, "planner.dayFill.demoBadge")}
                        </SoftFailBadge>
                      )}
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
                    accessibilityLabel={
                      applying
                        ? t(locale, "planner.dayFill.applying")
                        : t(locale, "planner.dayFill.apply")
                    }
                    style={({ pressed }) =>
                      StyleSheet.flatten([
                        styles.cta,
                        applying ? styles.ctaDisabled : null,
                        pressed && !applying ? styles.ctaPressed : null,
                      ])
                    }
                  >
                    <Text style={styles.ctaLabel}>
                      {applying
                        ? t(locale, "planner.dayFill.applying")
                        : t(locale, "planner.dayFill.apply")}
                    </Text>
                  </Pressable>
                </View>

                {proposal.days.map((day) => (
                  <SheetPresence
                    key={day.dayIndex}
                    open
                    delayMs={Math.min(day.dayIndex, 6) * 55}
                    rise={8}
                    style={styles.dayBlock}
                  >
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
                  </SheetPresence>
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
    /** Web bg-foam/92 — Lumen foam @ 0.92 */
    backgroundColor: `${colors.foam}EB`,
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
    /** Web bg-paper/70 — Lumen paper @ 0.70 */
    backgroundColor: `${colors.paper}B3`,
  },
  /** Soft azure Day fill rail wash when SoftFail owns depth (BEA-360). */
  headerSoft: {
    /** Web paper/85 when Soft owns */
    backgroundColor: `${colors.paper}D9`,
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
  headerEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    /** Web sheet eyebrow tracking-[0.18em] — section/empty bar */
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  title: {
    ...type.display,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  headerCount: {
    ...type.body,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    /** Web text-ink-soft/80 */
    color: `${colors.inkSoft}CC`,
  },
  support: {
    ...type.body,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    /** Web text-ink-soft/80 */
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
  /** Mist SoftFail strip under azure Day fill rail — border-b before tip-011 body. */
  sheetSoftFail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderTopWidth: 0,
  },
  prefs: {
    /** Web space-y-3 */
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  stage: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  stageSoft: {
    /** Mist tip-011 wash @ 0.12 */
    backgroundColor: `${colors.mist}1F`,
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
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  prefsSupport: {
    ...type.body,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
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
    /** Web bg-mist/50 — Lumen mist @ 0.55 */
    backgroundColor: `${colors.mist}8C`,
    padding: 4,
  },
  interestChip: {
    borderRadius: radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  /** Foam select on mist-track — booking OTA / web day-fill parity (BEA-467). */
  interestChipOn: {
    backgroundColor: colors.foam,
    shadowColor: colors.river,
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: StyleSheet.hairlineWidth,
    /** Web ring-river/25 */
    borderColor: `${colors.river}40`,
  },
  chipPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  interestChipLabel: {
    ...type.body,
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  interestChipLabelOn: {
    color: colors.river,
  },
  prefsGrid: {
    /** Web gap-4 */
    gap: 16,
  },
  field: {
    gap: 0,
  },
  daysInput: {
    ...type.body,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    /** Web bg-paper/80 — Lumen paper @ 0.80 */
    backgroundColor: `${colors.paper}CC`,
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
  ctaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
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
  discardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  discardLabel: {
    ...type.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  loadingBlock: {
    /** Web space-y-2 */
    gap: 8,
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
    /** Web bg-paper/70 */
    backgroundColor: `${colors.paper}B3`,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  skeletonEyebrow: {
    width: 56,
    height: 8,
    borderRadius: 4,
    backgroundColor: `${colors.river}2E`,
  },
  skeletonTitle: {
    width: 112,
    height: 14,
    borderRadius: 4,
    backgroundColor: `${colors.ink}1A`,
  },
  skeletonLine: {
    width: "72%",
    height: 10,
    borderRadius: 4,
    backgroundColor: `${colors.ink}12`,
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
    backgroundColor: `${colors.ink}1A`,
  },
  skeletonNote: {
    width: 120,
    height: 18,
    borderRadius: radius.xs,
    backgroundColor: `${colors.river}1F`,
  },
  loadingHint: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    /** Web text-ink-soft/80 */
    color: `${colors.inkSoft}CC`,
  },
  empty: {
    maxWidth: 360,
    paddingVertical: 12,
    paddingHorizontal: 2,
    gap: 0,
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
  emptyTitle: {
    ...type.display,
    marginTop: 6,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  emptyHint: {
    ...type.body,
    marginTop: 6,
    fontSize: 14,
    lineHeight: 22,
    /** Web text-ink-soft/80 */
    color: `${colors.inkSoft}CC`,
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
    /** Web bg-paper/70 */
    backgroundColor: `${colors.paper}B3`,
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
    lineHeight: 20,
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
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: -0.15,
    color: colors.ink,
  },
  dayDate: {
    ...type.body,
    fontSize: 13,
    fontWeight: "400",
    /** Web text-ink-soft/80 */
    color: `${colors.inkSoft}CC`,
  },
  dayNote: {
    ...type.body,
    maxWidth: "100%",
    overflow: "hidden",
    borderRadius: radius.xs,
    backgroundColor: `${colors.river}1A`,
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: "700",
    color: colors.river,
  },
  stopList: {
    /** Web mt-2.5 */
    marginTop: 10,
    gap: 8,
  },
  stopRow: {
    flexDirection: "row",
    /** Web gap-3 — 4px grid */
    gap: 12,
    alignItems: "flex-start",
  },
  stopMarker: {
    marginTop: 1,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.river}1F`,
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
    /** Web truncate stop name — leading-snug parity */
    lineHeight: 20,
    color: colors.ink,
  },
  stopWalk: {
    ...type.body,
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    /** Web text-ink-soft/80 */
    color: `${colors.inkSoft}CC`,
  },
  noStops: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    /** Web text-ink-soft/80 */
    color: `${colors.inkSoft}CC`,
  },
});
