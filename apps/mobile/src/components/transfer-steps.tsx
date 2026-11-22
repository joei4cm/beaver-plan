import { useRef, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Leg, TransitStep } from "@beaver/core";
import {
  formatDistance,
  formatDuration,
  formatTransitStepLabel,
  normalizeStepMode,
  summarizeTransfer,
} from "@beaver/core";
import { t, type Locale } from "@beaver/i18n";
import { colors, radius } from "@beaver/ui-tokens";
import { type } from "../theme";
import { SheetPresence } from "./sheet-presence";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailBandStyle,
  softFailMistWashStyle,
} from "./soft-fail-notice";

type Props = {
  leg: Leg | null;
  locale: Locale;
  /** Soft demo badge when live Directions keys are absent. */
  demoMode?: boolean;
  /**
   * Show SoftFailNotice under the step list (selected stop only —
   * avoids repeating the notice on every leg row).
   */
  showSoftFail?: boolean;
  /**
   * Soft-fail empty shell when Directions is absent and this stop has
   * no leg / no transit steps yet (selected stop only).
   */
  showEmpty?: boolean;
  /**
   * Craft SoftFail query: `/trips/…?transferSoftFail=1` (BEA-423 / #282 parity).
   * Prefer parent prop from trip detail; fall back to window search (Expo web).
   */
  craftSoftFail?: boolean;
  style?: StyleProp<ViewStyle>;
};

function SectionEyebrow({ children }: { children: string }) {
  return <Text style={styles.sectionEyebrow}>{children}</Text>;
}

function stepKindLabel(locale: Locale, mode: string): string {
  const kind = normalizeStepMode(mode);
  const key =
    kind === "walk"
      ? "planner.transfer.walk"
      : kind === "transit"
        ? "planner.transfer.ride"
        : kind === "transfer"
          ? "planner.transfer.change"
          : kind === "drive"
            ? "planner.mode.drive"
            : kind === "wait"
              ? "planner.transfer.wait"
              : "planner.transfer.step";
  return t(locale, key);
}

function modeLabel(locale: Locale, mode: Leg["mode"]): string {
  if (mode === "transit") return t(locale, "planner.mode.transit");
  if (mode === "walk") return t(locale, "planner.mode.walk");
  return t(locale, "planner.mode.drive");
}

type ModeTone = {
  icon: ViewStyle;
  iconText: TextStyleLike;
  rail: ViewStyle;
  mark: string;
};

type TextStyleLike = {
  color: string;
};

function modeTone(mode: string): ModeTone {
  const kind = normalizeStepMode(mode);
  switch (kind) {
    case "walk":
      return {
        icon: styles.iconWalk,
        iconText: styles.iconTextWalk,
        rail: styles.railWalk,
        mark: "··",
      };
    case "transit":
      return {
        icon: styles.iconTransit,
        iconText: styles.iconTextTransit,
        rail: styles.railTransit,
        mark: "●",
      };
    case "transfer":
      return {
        icon: styles.iconTransfer,
        iconText: styles.iconTextTransfer,
        rail: styles.railTransfer,
        mark: "↔",
      };
    case "drive":
      return {
        icon: styles.iconDrive,
        iconText: styles.iconTextDrive,
        rail: styles.railDrive,
        mark: "▶",
      };
    default:
      return {
        icon: styles.iconDefault,
        iconText: styles.iconTextDefault,
        rail: styles.railDefault,
        mark: "·",
      };
  }
}

function StepIcon({ mode }: { mode: string }) {
  const tone = modeTone(mode);
  return (
    <View style={StyleSheet.flatten([styles.stepIcon, tone.icon])}>
      <Text style={StyleSheet.flatten([styles.stepIconMark, tone.iconText])}>
        {tone.mark}
      </Text>
    </View>
  );
}

function StepRow({
  step,
  locale,
  last,
}: {
  step: TransitStep;
  locale: Locale;
  last: boolean;
}) {
  const kind = normalizeStepMode(step.mode);
  const label = formatTransitStepLabel(step);
  const tone = modeTone(step.mode);

  return (
    <View style={styles.stepRow}>
      {!last ? (
        <View
          style={StyleSheet.flatten([styles.stepRail, tone.rail])}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <StepIcon mode={step.mode} />
      <View style={StyleSheet.flatten([styles.stepBody, last && styles.stepBodyLast])}>
        <View style={styles.stepMeta}>
          <Text style={styles.stepKind}>{stepKindLabel(locale, step.mode)}</Text>
          {step.durationSec != null && step.durationSec > 0 ? (
            <Text style={styles.stepDuration}>
              {formatDuration(step.durationSec)}
            </Text>
          ) : null}
          {kind === "transit" && step.agency ? (
            <Text style={styles.stepAgency}>{step.agency}</Text>
          ) : null}
        </View>

        {kind === "transit" && step.lineName ? (
          <View style={styles.lineRow}>
            <View style={styles.lineBadge}>
              <Text style={styles.lineBadgeText} numberOfLines={1}>
                {step.lineName}
              </Text>
            </View>
            {step.fromStopName && step.toStopName ? (
              <Text style={styles.lineStops} numberOfLines={1}>
                {step.fromStopName}
                <Text style={styles.lineArrow}> → </Text>
                {step.toStopName}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.stepLabel}>{label}</Text>
        )}

        {kind === "transit" &&
        step.instruction &&
        step.instruction !== label &&
        step.instruction !== step.lineName ? (
          <Text style={styles.stepInstruction} numberOfLines={1}>
            {step.instruction}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function LegCardHeader({
  locale,
  demoMode,
  softOpen,
  view,
}: {
  locale: Locale;
  demoMode: boolean;
  softOpen: boolean;
  view?: Leg | null;
}) {
  return (
    <View
      style={StyleSheet.flatten([
        styles.header,
        softOpen ? styles.headerSoft : null,
      ])}
    >
      <View style={styles.headerLeft}>
        <Text style={styles.headerTitle}>
          {t(locale, "planner.transfer.title")}
        </Text>
        {softOpen || demoMode ? (
          <SoftFailBadge>
            {softOpen
              ? t(locale, "planner.transfer.softBadge")
              : t(locale, "planner.transfer.demoBadge")}
          </SoftFailBadge>
        ) : (
          <SoftFailLiveBadge>
            {t(locale, "planner.transfer.liveBadge")}
          </SoftFailLiveBadge>
        )}
        {softOpen ? (
          <SoftFailSupport style={styles.softSupportShrink} numberOfLines={2}>
            {t(locale, "planner.transfer.softSupport")}
          </SoftFailSupport>
        ) : null}
      </View>
      {view ? (
        <Text style={styles.headerMeta}>
          <Text style={styles.headerDuration}>
            {formatDuration(view.durationSec)}
          </Text>
          <Text style={styles.headerDot}> · </Text>
          {formatDistance(view.distanceM)}
          <Text style={styles.headerDot}> · </Text>
          {modeLabel(locale, view.mode)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Expo transit panel — SoftFail depth kept (BEA-396 / BEA-423) + wave 48 craft
 * residual (BEA-462): Lumen tokens · SheetPresence Summary / Steps · azure
 * Transfer rail. Craft SoftFail: `/trips/…?transferSoftFail=1`. SoftFailBadge
 * Soft/Demo · SoftFailLiveBadge · SoftFailSupport · softFailBandStyle mist band ·
 * tip-011 softFailMistWashStyle. SoftFail copy always softFail / softFailEmpty —
 * never timber / Failed to fetch. Mode SoftFail yields while TransferSteps owns
 * selected-stop soft chrome (no double depth). No `/dev` gallery.
 */
export function TransferSteps({
  leg,
  locale,
  demoMode = false,
  showSoftFail = false,
  showEmpty = false,
  craftSoftFail = false,
  style,
}: Props) {
  const snapRef = useRef<Leg | null>(null);
  if (leg) snapRef.current = leg;

  const view = leg ?? snapRef.current;
  const hasSteps = Boolean(view && view.transitSteps.length > 0);
  const empty = Boolean(showEmpty && !leg);
  const open = Boolean(leg) || empty;
  /**
   * Craft SoftFail query parity with web (`?transferSoftFail=1`) — prefer Expo
   * Router param from trip detail (#282); fall back to window search (Expo web).
   */
  const [windowTransferSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("transferSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  const transferSoftPreview = craftSoftFail || windowTransferSoftPreview;
  /**
   * SoftFail owns Soft transfer chrome when Directions absent / craft
   * `?transferSoftFail=1` (selected stop). Mode SoftFail yields while this owns.
   */
  const softOpen =
    transferSoftPreview || (demoMode && (showSoftFail || empty));

  return (
    <SheetPresence
      open={open}
      delayMs={50}
      rise={10}
      style={StyleSheet.flatten([styles.shell, style])}
      accessibilityLabel={t(locale, "planner.transfer.title")}
    >
      {empty ? (
        <>
          <LegCardHeader
            locale={locale}
            demoMode={demoMode || transferSoftPreview}
            softOpen={softOpen}
          />
          {/* Compact SoftFail under azure rail — Craft: ?transferSoftFail=1. */}
          <SoftFailNotice open={softOpen} compact style={softFailBandStyle}>
            {t(locale, "planner.transfer.softFailEmpty")}
          </SoftFailNotice>
          <SheetPresence
            open
            delayMs={60}
            rise={8}
            style={StyleSheet.flatten([
              styles.emptyBody,
              softOpen ? softFailMistWashStyle : null,
            ])}
            accessibilityLabel={t(locale, "planner.transfer.emptyTitle")}
          >
            <SectionEyebrow>
              {t(locale, "planner.transfer.emptyEyebrow")}
            </SectionEyebrow>
            <Text style={styles.emptyTitle}>
              {t(locale, "planner.transfer.emptyTitle")}
            </Text>
            <Text style={styles.emptyHint}>
              {t(locale, "planner.transfer.emptyHint")}
            </Text>
          </SheetPresence>
        </>
      ) : view ? (
        <>
          <LegCardHeader
            locale={locale}
            demoMode={demoMode || transferSoftPreview}
            softOpen={softOpen}
            view={view}
          />
          {/* SoftFail mist band under azure Transfer rail — Craft: ?transferSoftFail=1. */}
          <SoftFailNotice open={softOpen} compact style={softFailBandStyle}>
            {t(locale, "planner.transfer.softFail")}
          </SoftFailNotice>

          <View
            style={StyleSheet.flatten([
              styles.sections,
              softOpen ? softFailMistWashStyle : null,
            ])}
          >
            <SheetPresence
              open
              delayMs={55}
              rise={8}
              style={styles.section}
              accessibilityLabel={t(locale, "planner.transfer.summaryEyebrow")}
            >
              <SectionEyebrow>
                {t(locale, "planner.transfer.summaryEyebrow")}
              </SectionEyebrow>
              <View style={styles.summaryRow}>
                <View style={styles.modeBadge}>
                  <Text style={styles.modeBadgeText}>
                    {modeLabel(locale, view.mode)}
                  </Text>
                </View>
                <Text style={styles.summaryText}>{summarizeTransfer(view)}</Text>
              </View>
            </SheetPresence>

            {hasSteps ? (
              <SheetPresence
                open
                delayMs={75}
                rise={6}
                style={StyleSheet.flatten([styles.section, styles.stepsSection])}
                accessibilityLabel={t(locale, "planner.transfer.stepsEyebrow")}
              >
                <SectionEyebrow>
                  {t(locale, "planner.transfer.stepsEyebrow")}
                </SectionEyebrow>
                <View style={styles.stepList}>
                  {view.transitSteps.map((step, i) => (
                    <StepRow
                      key={`${view.id}-step-${i}`}
                      step={step}
                      locale={locale}
                      last={i === view.transitSteps.length - 1}
                    />
                  ))}
                </View>
              </SheetPresence>
            ) : null}
          </View>
        </>
      ) : null}
    </SheetPresence>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginTop: 10,
    overflow: "hidden",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(244,246,250,0.98)",
  },
  /** Layout-only shrink for SoftFailSupport beside azure Transfer titles. */
  softSupportShrink: {
    flexShrink: 1,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  headerSoft: {
    backgroundColor: "rgba(230, 236, 245, 0.35)",
  },
  headerLeft: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    flexShrink: 1,
  },
  headerTitle: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
  },
  headerMeta: {
    ...type.body,
    flexShrink: 0,
    fontSize: 11,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  headerDuration: {
    ...type.display,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  headerDot: {
    color: "rgba(100,116,139,0.4)",
  },
  sections: {
    borderTopWidth: 0,
  },
  section: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 8,
  },
  stepsSection: {
    paddingBottom: 6,
  },
  sectionEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
  },
  modeBadge: {
    borderRadius: radius.xs,
    backgroundColor: "rgba(47,107,255,0.1)",
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modeBadgeText: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.river,
  },
  summaryText: {
    ...type.body,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    color: colors.ink,
  },
  stepList: {
    marginTop: 4,
    gap: 0,
  },
  stepRow: {
    position: "relative",
    flexDirection: "row",
    gap: 12,
  },
  stepRail: {
    position: "absolute",
    left: 11,
    top: 26,
    bottom: -4,
    width: 2,
    borderRadius: 999,
  },
  railWalk: {
    backgroundColor: "rgba(100,116,139,0.35)",
  },
  railTransit: {
    backgroundColor: "rgba(47,107,255,0.55)",
  },
  railTransfer: {
    backgroundColor: "rgba(47,107,255,0.3)",
  },
  railDrive: {
    backgroundColor: "rgba(15,23,42,0.4)",
  },
  railDefault: {
    backgroundColor: colors.line,
  },
  stepIcon: {
    marginTop: 2,
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconWalk: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(100,116,139,0.55)",
    borderStyle: "dashed",
    backgroundColor: "rgba(230,236,245,0.8)",
  },
  iconTransit: {
    backgroundColor: colors.river,
  },
  iconTransfer: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47,107,255,0.4)",
    backgroundColor: "rgba(47,107,255,0.1)",
  },
  iconDrive: {
    backgroundColor: colors.ink,
  },
  iconDefault: {
    backgroundColor: colors.mist,
  },
  stepIconMark: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  iconTextWalk: {
    color: colors.inkSoft,
  },
  iconTextTransit: {
    color: colors.foam,
  },
  iconTextTransfer: {
    color: colors.river,
  },
  iconTextDrive: {
    color: colors.foam,
  },
  iconTextDefault: {
    color: colors.inkSoft,
  },
  stepBody: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 14,
  },
  stepBodyLast: {
    paddingBottom: 4,
  },
  stepMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
  },
  stepKind: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  stepDuration: {
    ...type.display,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.river,
    fontVariant: ["tabular-nums"],
  },
  stepAgency: {
    ...type.body,
    fontSize: 11,
    color: "rgba(100,116,139,0.8)",
  },
  lineRow: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  lineBadge: {
    maxWidth: "100%",
    borderRadius: radius.xs,
    backgroundColor: "rgba(47,107,255,0.1)",
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lineBadgeText: {
    ...type.body,
    fontSize: 12,
    fontWeight: "700",
    color: colors.river,
  },
  lineStops: {
    ...type.body,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    color: colors.inkSoft,
  },
  lineArrow: {
    color: "rgba(47,107,255,0.7)",
  },
  stepLabel: {
    ...type.body,
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  stepInstruction: {
    ...type.body,
    marginTop: 4,
    fontSize: 12,
    color: colors.inkSoft,
  },
  emptyBody: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 6,
  },
  emptyTitle: {
    ...type.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  emptyHint: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
});
