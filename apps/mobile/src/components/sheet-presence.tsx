import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { motion } from "@beaver/ui-tokens";

/** Tip 011 / #46 — entrances ease-out-strong (match booking / invite sheets). */
const easeRise = Easing.bezier(0.22, 1, 0.36, 1);

type Props = {
  open: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra Y rise distance (default 12). */
  rise?: number;
  /** Stagger delay before entrance (ms). */
  delayMs?: number;
  accessibilityLabel?: string;
};

/**
 * Expo SheetPresence — #46 cubic-bezier enter for planner sheets.
 * Parity with web SheetPresence (BEA-90 / place intel #85): mount when open,
 * opacity + translateY rise, StyleSheet.flatten for RN Web.
 */
export function SheetPresence({
  open,
  children,
  style,
  rise = 12,
  delayMs = 0,
  accessibilityLabel,
}: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!open) {
      anim.setValue(0);
      return;
    }
    anim.setValue(0);
    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration: motion.durationMdMs,
        easing: easeRise,
        useNativeDriver: true,
      }).start();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [open, delayMs, anim]);

  if (!open) return null;

  const motionStyle = {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [rise, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      style={StyleSheet.flatten([style, motionStyle])}
    >
      {children}
    </Animated.View>
  );
}
