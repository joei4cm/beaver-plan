import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  DAY_FILL_INTERESTS,
  type DayFillInterest,
  type PlaceDetails,
} from "@beaver/core";
import { t, type Locale, type MessageKey } from "@beaver/i18n";
import { colors, radius } from "@beaver/ui-tokens";
import { type } from "../theme";
import { SheetPresence } from "./sheet-presence";
import { SoftFailNotice } from "./soft-fail-notice";

type Props = {
  details: PlaceDetails | null;
  loading?: boolean;
  locale: Locale;
  /** Demo / soft-fail badge when live Places is unavailable. */
  demoMode?: boolean;
  userNote?: string;
};

const INTEREST_KEYS: Record<DayFillInterest, MessageKey> = {
  temples: "planner.dayFill.interest.temples",
  food: "planner.dayFill.interest.food",
  nature: "planner.dayFill.interest.nature",
  shopping: "planner.dayFill.interest.shopping",
  culture: "planner.dayFill.interest.culture",
  photo: "planner.dayFill.interest.photo",
};

function interestLabel(locale: Locale, tag: string): string {
  if ((DAY_FILL_INTERESTS as readonly string[]).includes(tag)) {
    return t(locale, INTEREST_KEYS[tag as DayFillInterest]);
  }
  return tag;
}

function hasPlaceMeta(details: PlaceDetails, userNote?: string): boolean {
  return (
    details.rating != null ||
    Boolean(details.openingHours?.[0]) ||
    (details.tags?.length ?? 0) > 0 ||
    Boolean(details.summary) ||
    Boolean(userNote)
  );
}

function SectionEyebrow({ children }: { children: string }) {
  return <Text style={styles.sectionEyebrow}>{children}</Text>;
}

/**
 * Expo selected-stop place intel — Lumen hierarchy after web #85:
 * azure header rail · Snapshot / Categories / About / Note · SoftFailNotice
 * when Places API absent · SheetPresence #46 rise · StyleSheet.flatten.
 */
export function PlaceIntel({
  details,
  loading,
  locale,
  demoMode,
  userNote,
}: Props) {
  const snapRef = useRef<{
    details: PlaceDetails;
    userNote?: string;
    demoMode?: boolean;
  } | null>(null);

  if (loading && !details) {
    return (
      <View
        style={styles.skeletonRoot}
        accessibilityLabel={t(locale, "planner.place.loading")}
      >
        <View style={styles.skeletonHeader} />
        <View style={styles.skeletonBlock} />
        <View style={StyleSheet.flatten([styles.skeletonBlock, styles.skeletonShort])} />
      </View>
    );
  }

  const open = Boolean(details && hasPlaceMeta(details, userNote));
  if (details && hasPlaceMeta(details, userNote)) {
    snapRef.current = { details, userNote, demoMode };
  }
  const snap = snapRef.current;
  const view = snap?.details;
  const note = snap?.userNote;
  const demo = snap?.demoMode;
  const hours = view?.openingHours?.[0];
  const extraHours = view?.openingHours?.slice(1, 3) ?? [];
  const tags = view?.tags?.slice(0, 4) ?? [];
  const showSnapshot = view != null && (view.rating != null || Boolean(hours));
  const showTags = tags.length > 0;
  const showAbout = Boolean(view?.summary);
  const showNote = Boolean(note);

  return (
    <SheetPresence
      open={open}
      delayMs={40}
      rise={10}
      style={styles.root}
      accessibilityLabel={t(locale, "planner.place.eyebrow")}
    >
      {view ? (
        <>
          <View style={styles.header}>
            <Text style={styles.headerEyebrow}>
              {t(locale, "planner.place.eyebrow")}
            </Text>
            <View
              style={StyleSheet.flatten([
                styles.badge,
                demo ? styles.badgeDemo : styles.badgeLive,
              ])}
            >
              <Text
                style={StyleSheet.flatten([
                  styles.badgeText,
                  demo ? styles.badgeTextDemo : styles.badgeTextLive,
                ])}
              >
                {demo
                  ? t(locale, "planner.place.demoBadge")
                  : t(locale, "planner.place.liveBadge")}
              </Text>
            </View>
          </View>

          <View style={styles.sections}>
            {showSnapshot ? (
              <View
                style={styles.section}
                accessibilityLabel={t(locale, "planner.place.snapshotEyebrow")}
              >
                <SectionEyebrow>
                  {t(locale, "planner.place.snapshotEyebrow")}
                </SectionEyebrow>
                <View style={styles.snapshotRow}>
                  {view.rating != null ? (
                    <View style={styles.ratingChip}>
                      <Text style={styles.ratingStar} accessibilityElementsHidden>
                        ★
                      </Text>
                      <Text style={styles.ratingValue}>
                        {view.rating.toFixed(1)}
                      </Text>
                      <Text style={styles.srOnly}>
                        {t(locale, "planner.place.rating")}
                      </Text>
                    </View>
                  ) : null}
                  {hours ? (
                    <Text style={styles.hours}>
                      <Text style={styles.hoursLabel}>
                        {t(locale, "planner.place.hours")}{" "}
                      </Text>
                      <Text style={styles.hoursValue}>{hours}</Text>
                    </Text>
                  ) : null}
                </View>
                {extraHours.length > 0 ? (
                  <View style={styles.extraHours}>
                    {extraHours.map((line) => (
                      <Text key={line} style={styles.extraHourLine}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {showTags ? (
              <View
                style={styles.section}
                accessibilityLabel={t(locale, "planner.place.tags")}
              >
                <SectionEyebrow>
                  {t(locale, "planner.place.tags")}
                </SectionEyebrow>
                <View style={styles.tagRow}>
                  {tags.map((tag) => (
                    <Text key={tag} style={styles.tagChip}>
                      {interestLabel(locale, tag)}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {showAbout ? (
              <View
                style={styles.section}
                accessibilityLabel={t(locale, "planner.place.aboutEyebrow")}
              >
                <SectionEyebrow>
                  {t(locale, "planner.place.aboutEyebrow")}
                </SectionEyebrow>
                <Text style={styles.summary}>{view.summary}</Text>
              </View>
            ) : null}

            {showNote ? (
              <View
                style={styles.noteSection}
                accessibilityLabel={t(locale, "planner.place.note")}
              >
                <SectionEyebrow>
                  {t(locale, "planner.place.note")}
                </SectionEyebrow>
                <Text style={styles.note}>{note}</Text>
              </View>
            ) : null}
          </View>

          <SoftFailNotice open={Boolean(demo)} compact>
            {t(locale, "planner.place.softFail")}
          </SoftFailNotice>
        </>
      ) : null}
    </SheetPresence>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 10,
    overflow: "hidden",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
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
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  headerEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.river,
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
  sectionEyebrow: {
    ...type.body,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.river,
  },
  snapshotRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  ratingChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    borderRadius: radius.xs,
    backgroundColor: "rgba(47,107,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.river,
  },
  ratingStar: {
    ...type.body,
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(47,107,255,0.8)",
  },
  ratingValue: {
    ...type.display,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: colors.river,
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  hours: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
    flexShrink: 1,
  },
  hoursLabel: {
    fontWeight: "600",
    color: "rgba(100, 116, 139, 0.85)",
  },
  hoursValue: {
    color: "rgba(15, 23, 42, 0.85)",
  },
  extraHours: {
    gap: 2,
  },
  extraHourLine: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagChip: {
    ...type.body,
    overflow: "hidden",
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(47,107,255,0.2)",
    backgroundColor: "rgba(47,107,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: "600",
    color: colors.riverDeep,
  },
  summary: {
    ...type.body,
    fontSize: 14,
    lineHeight: 21,
    color: "rgba(15, 23, 42, 0.9)",
  },
  noteSection: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: "rgba(244, 246, 250, 0.4)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
    gap: 6,
  },
  note: {
    ...type.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  skeletonRoot: {
    marginTop: 10,
    overflow: "hidden",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    gap: 0,
  },
  skeletonHeader: {
    height: 36,
    backgroundColor: "rgba(230,236,245,0.85)",
    borderLeftWidth: 3,
    borderLeftColor: colors.river,
  },
  skeletonBlock: {
    height: 56,
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: radius.xs,
    backgroundColor: "rgba(230,236,245,0.7)",
  },
  skeletonShort: {
    height: 40,
    marginTop: 0,
    marginBottom: 12,
  },
});
