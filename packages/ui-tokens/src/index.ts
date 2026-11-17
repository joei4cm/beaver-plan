/** Shared design tokens for Beaver Plan / 海狸旅行 — Horizon Cartograph (redesign v2). */

export const brand = {
  en: "Beaver Plan",
  zh: "海狸旅行",
  taglineZh: "地图上认真规划的一次旅行",
  taglineEn: "Plan a trip worth walking",
} as const;

/**
 * Cool atlas palette — fog paper, navy ink, lagoon primary, vermillion signal.
 * Deliberately not cream+terracotta, not purple SaaS, not dark-by-default.
 */
export const colors = {
  ink: "#0B1420",
  inkSoft: "#5A6574",
  paper: "#F3F5F7",
  mist: "#E1E7EE",
  river: "#0C7C78",
  riverDeep: "#064A4F",
  timber: "#E84E2F",
  foam: "#FAFBFC",
  line: "rgba(11, 20, 32, 0.1)",
  focus: "#19A8A1",
  shadow: "rgba(11, 20, 32, 0.1)",
  shadowDeep: "rgba(11, 20, 32, 0.22)",
} as const;

export const fonts = {
  display: '"Syne", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
  body: '"Outfit", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
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

export const radius = {
  sm: 4,
  md: 10,
  lg: 16,
} as const;

export const motion = {
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  durationFastMs: 200,
  durationMs: 420,
  durationSlowMs: 640,
} as const;

export const tokens = { brand, colors, fonts, space, radius, motion } as const;
