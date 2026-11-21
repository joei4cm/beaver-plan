/** Shared design tokens for Beaver Plan / 海狸旅行 — Lumen Route (redesign v3). */

export const brand = {
  en: "Beaver Plan",
  zh: "海狸旅行",
  taglineZh: "地图上认真规划的一次旅行",
  taglineEn: "Plan a trip worth walking",
} as const;

/**
 * Lumen Route palette — luminous paper, azure signal, ink chrome.
 * Not cream+terracotta, not fog/Syne/vermillion Cartograph, not purple SaaS.
 */
export const colors = {
  ink: "#0F172A",
  inkSoft: "#64748B",
  paper: "#F4F6FA",
  mist: "#E6ECF5",
  river: "#2F6BFF",
  riverDeep: "#1A4FD6",
  timber: "#E11D48",
  foam: "#FFFFFF",
  line: "rgba(15, 23, 42, 0.1)",
  focus: "#60A5FA",
  shadow: "rgba(15, 23, 42, 0.08)",
  shadowDeep: "rgba(15, 23, 42, 0.18)",
} as const;

export const fonts = {
  display:
    '"Bricolage Grotesque", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
  body: '"Plus Jakarta Sans", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

export const space = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.5rem",
  6: "2rem",
  7: "3rem",
  8: "4.5rem",
} as const;

/** 4px-grid radii — nested: inner ≈ outer − padding (floor 4). */
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 24,
} as const;

/** Role-based easing (Vibe tip 011). */
export const motion = {
  easeOut: "cubic-bezier(0, 0, 0.58, 1)",
  easeOutStrong: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeIn: "cubic-bezier(0.42, 0, 1, 1)",
  easeInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
  easeOvershoot: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** @deprecated alias of easeOutStrong */
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  durationSmMs: 200,
  durationMdMs: 320,
  durationLgMs: 420,
  durationFastMs: 200,
  durationMs: 320,
  durationSlowMs: 420,
} as const;

export const tokens = { brand, colors, fonts, space, radius, motion } as const;
