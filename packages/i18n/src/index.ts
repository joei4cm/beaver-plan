import en from "./en/common.json";
import zhCN from "./zh-CN/common.json";

export type Locale = "zh-CN" | "en";
export type MessageKey = keyof typeof zhCN;

export const messages = {
  "zh-CN": zhCN,
  en,
} as const;

export const defaultLocale: Locale = "zh-CN";

export function t(
  locale: Locale,
  key: MessageKey,
  fallback?: string,
): string {
  const table = messages[locale] ?? messages[defaultLocale];
  return table[key] ?? fallback ?? key;
}

export function isLocale(value: string): value is Locale {
  return value === "zh-CN" || value === "en";
}
