import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius } from "@beaver/ui-tokens";
import { type } from "../theme";

type Props = {
  children: string;
  style?: StyleProp<ViewStyle>;
  /** Tighter strip for nested panels. */
  compact?: boolean;
};

/**
 * One muted Lumen Route notice for demo / keys-missing / API-absent soft-fail.
 * Mist wash + ink-soft copy — parity with web SoftFailNotice (#55 / #72).
 */
export function SoftFailNotice({ children, style, compact }: Props) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={StyleSheet.flatten([
        compact ? styles.compact : styles.notice,
        style,
      ])}
    >
      <Text
        style={StyleSheet.flatten([
          styles.text,
          compact ? styles.textCompact : null,
        ])}
      >
        {children}
      </Text>
    </View>
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
