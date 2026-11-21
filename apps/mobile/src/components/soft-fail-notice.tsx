import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, motion, radius } from "@beaver/ui-tokens";
import { type } from "../theme";

type Props = {
  children: string;
  style?: StyleProp<ViewStyle>;
  /** Tighter strip for nested panels. */
  compact?: boolean;
  /**
   * Presence gate for enter/exit. When false, plays rise-out then unmounts.
   * Default true — omit when the parent only mounts while visible (enter-only).
   * Parity with web SoftFailNotice open (#87 offline banner).
   */
  open?: boolean;
};

/** Match web `--bp-duration` (320ms) + small buffer for animation end misses. */
const EXIT_FALLBACK_MS = motion.durationMdMs + 60;

/** Tip 011 — ease-out strong (enter) / ease-in (exit), paired with #46. */
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);
const easeIn = Easing.bezier(0.42, 0, 1, 1);

/**
 * One muted Lumen Route notice for demo / keys-missing / API-absent / offline soft-fail.
 * Mist wash + ink-soft copy — never timber, never raw "Failed to fetch".
 * Enter: easeRise + tip-011 ease-out (#46). Exit: paired ease-in rise-out (#87).
 * StyleSheet.flatten keeps RN Web Pressable/Link parents from choking on style arrays (#76).
 */
export function SoftFailNotice({
  children,
  style,
  compact,
  open = true,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [text, setText] = useState(children);
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
    if (open) setText(children);
  }, [children, open]);

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

  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={StyleSheet.flatten([
        compact ? styles.compact : styles.notice,
        { opacity, transform: [{ translateY }] },
        style,
      ])}
    >
      <Text
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
    backgroundColor: "rgba(230, 236, 245, 0.5)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  compact: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(230, 236, 245, 0.4)",
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
