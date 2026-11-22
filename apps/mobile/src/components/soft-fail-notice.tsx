import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, motion, radius } from "@beaver/ui-tokens";
import { type } from "../theme";

type SoftFailBand = "under" | "footer";

type Props = {
  children: string;
  style?: StyleProp<ViewStyle>;
  /** Tighter strip for nested panels. */
  compact?: boolean;
  /**
   * Compact edge treatment.
   * - `under` (default): tip-011 mist band under an azure rail (`border-b`).
   * - `footer`: legacy top-rule strip at the bottom of a card (`border-t`).
   */
  band?: SoftFailBand;
  /**
   * Presence gate for enter/exit. When false, plays rise-out then unmounts.
   * Default true — omit when the parent only mounts while visible (enter-only).
   * Parity with web SoftFailNotice open (#87 offline banner).
   */
  open?: boolean;
  /**
   * Safe copy when `children` is raw transport noise ("Failed to fetch", etc.).
   * SoftFailNotice never paints timber or raw network errors as defaults.
   */
  fallback?: string;
};

/** Match web `--bp-duration` (320ms) + small buffer for animation end misses. */
const EXIT_FALLBACK_MS = motion.durationMdMs + 60;

/** Tip 011 — ease-out strong (enter) / ease-in (exit), paired with #46. */
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);
const easeIn = Easing.bezier(0.42, 0, 1, 1);

/** Lumen mist (#E6ECF5) with alpha — never hardcoded off-palette greys. */
function mistWash(alpha: number): string {
  const hex = colors.mist.replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Raw browser / transport noise SoftFailNotice must never paint as copy.
 * Exact / near-exact messages only — i18n that mentions "Failed to fetch"
 * as reassurance stays intact.
 */
export function isRawSoftFailNoise(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (/^failed to fetch\.?$/i.test(text)) return true;
  if (/^network request failed\.?$/i.test(text)) return true;
  if (/^load[_ ]failed\.?$/i.test(text)) return true;
  if (/^typeerror:/i.test(text)) return true;
  if (/^econnrefused/i.test(text)) return true;
  if (/^(error:\s*)?(network\s*)?error\.?$/i.test(text)) return true;
  return false;
}

/** Prefer soft i18n copy over raw transport noise. */
export function sanitizeSoftFailCopy(
  message: string,
  fallback = "",
): string {
  return isRawSoftFailNoise(message) ? fallback : message;
}

/** tip-011 mist band under azure rail — border-b, clear top rule. */
export const softFailBandStyle: ViewStyle = {
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.line,
  borderTopWidth: 0,
};

/** tip-011 mist-wash body / CTA track under a SoftFail mist band (parity web from-mist/25). */
export const softFailMistWashStyle: ViewStyle = {
  backgroundColor: mistWash(0.25),
};

/** Soft badge chip styles — mist / ink-soft, never timber. */
export const softFailBadgeStyle: ViewStyle = {
  borderRadius: radius.xs,
  backgroundColor: colors.mist,
  paddingHorizontal: 6,
  paddingVertical: 2,
};

export const softFailBadgeLabelStyle: TextStyle = {
  ...type.body,
  fontSize: 10,
  fontWeight: "700",
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: colors.inkSoft,
};

/** Live badge chip — river wash while keys are present (parity SoftFailBadge). */
export const softFailLiveBadgeStyle: ViewStyle = {
  borderRadius: radius.xs,
  backgroundColor: "rgba(47,107,255,0.12)",
  paddingHorizontal: 6,
  paddingVertical: 2,
};

export const softFailLiveBadgeLabelStyle: TextStyle = {
  ...type.body,
  fontSize: 10,
  fontWeight: "700",
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: colors.riverDeep,
};

export type SoftFailBadgeTone = "soft" | "live";

export const softFailSupportStyle: TextStyle = {
  ...type.body,
  fontSize: 11,
  lineHeight: 16,
  color: colors.inkSoft,
  opacity: 0.8,
};

/**
 * Soft | Live badge composition helper — Lumen mist (soft) or river wash
 * (live). Never timber. Default tone stays Soft for existing call sites.
 */
export function SoftFailBadge({
  children,
  style,
  labelStyle,
  tone = "soft",
}: {
  children: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  tone?: SoftFailBadgeTone;
}) {
  const chip = tone === "live" ? softFailLiveBadgeStyle : softFailBadgeStyle;
  const label =
    tone === "live" ? softFailLiveBadgeLabelStyle : softFailBadgeLabelStyle;
  return (
    <View style={StyleSheet.flatten([chip, style])}>
      <Text style={StyleSheet.flatten([label, labelStyle])}>{children}</Text>
    </View>
  );
}

/** Live badge helper — SoftFailBadge tone="live" shorthand. */
export function SoftFailLiveBadge({
  children,
  style,
  labelStyle,
}: {
  children: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}) {
  return (
    <SoftFailBadge tone="live" style={style} labelStyle={labelStyle}>
      {children}
    </SoftFailBadge>
  );
}
/** softSupport composition helper — ink-soft line beside azure rail titles. */
export function SoftFailSupport({
  children,
  style,
  numberOfLines,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      style={StyleSheet.flatten([softFailSupportStyle, style])}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

/**
 * One muted Lumen Route notice for demo / keys-missing / API-absent / offline soft-fail.
 * Mist wash + ink-soft copy — never timber, never raw "Failed to fetch".
 * Compact defaults to tip-011 mist band (`border-b`) under azure rails.
 * Enter: easeRise + tip-011 ease-out (#46). Exit: paired ease-in rise-out (#87).
 * StyleSheet.flatten keeps RN Web Pressable/Link parents from choking on style arrays (#76).
 *
 * A11y depth (BEA-385): ARIA `role="status"` + `accessibilityLiveRegion="polite"`
 * on the SoftFail mist band (parity with web role/status + aria-live). Focus-safe —
 * non-focusable chrome so Soft badge · softSupport · tip-011 mist-band keep focus.
 */
export function SoftFailNotice({
  children,
  style,
  compact,
  band = "under",
  open = true,
  fallback = "",
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [text, setText] = useState(sanitizeSoftFailCopy(children, fallback));
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(open ? 0 : 16)).current;
  const openRef = useRef(open);
  const reduceMotionRef = useRef(false);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) reduceMotionRef.current = enabled;
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotionRef.current = enabled;
      },
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (open) setText(sanitizeSoftFailCopy(children, fallback));
  }, [children, fallback, open]);

  useEffect(() => {
    openRef.current = open;
    animRef.current?.stop();

    if (open) {
      setMounted(true);
      if (reduceMotionRef.current) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }
      opacity.setValue(0);
      translateY.setValue(compact ? 8 : 16);
      animRef.current = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.durationMdMs,
          easing: easeRise,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: motion.durationMdMs,
          easing: easeRise,
          useNativeDriver: true,
        }),
      ]);
      animRef.current.start();
      return;
    }

    if (!mounted) return;

    if (reduceMotionRef.current) {
      opacity.setValue(0);
      translateY.setValue(0);
      setMounted(false);
      return;
    }

    // bp-rise-out: opacity → 0, translateY → -10
    animRef.current = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: motion.durationMdMs,
        easing: easeIn,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -10,
        duration: motion.durationMdMs,
        easing: easeIn,
        useNativeDriver: true,
      }),
    ]);
    animRef.current.start(({ finished }) => {
      if (finished && !openRef.current) setMounted(false);
    });

    const timer = setTimeout(() => {
      if (!openRef.current) setMounted(false);
    }, EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [open, mounted, compact, opacity, translateY]);

  if (!mounted) return null;

  const compactStyle =
    band === "footer" ? styles.compactFooter : styles.compactUnder;

  return (
    <Animated.View
      role="status"
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={text}
      importantForAccessibility="yes"
      style={StyleSheet.flatten([
        compact ? compactStyle : styles.notice,
        { opacity, transform: [{ translateY }] },
        style,
      ])}
    >
      <Text
        accessible={false}
        importantForAccessibility="no"
        style={StyleSheet.flatten([
          styles.text,
          compact ? styles.textCompact : null,
        ])}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: mistWash(0.5),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  /** tip-011 mist band under azure rail — border-b default. */
  compactUnder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderTopWidth: 0,
    backgroundColor: mistWash(0.4),
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  /** Legacy footer strip — border-t at card bottom (TransferSteps). */
  compactFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderBottomWidth: 0,
    backgroundColor: mistWash(0.4),
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    ...type.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  textCompact: {
    fontSize: 12,
    lineHeight: 18,
  },
});
