/** Shared design tokens for Beaver Plan / 海狸旅行. */

export const brand = {
  en: "Beaver Plan",
  zh: "海狸旅行",
  taglineZh: "地图上认真规划的一次旅行",
  taglineEn: "Plan a trip worth walking",
} as const;

export const colors = {
  ink: "#101a17",
  inkSoft: "#3a4a43",
  paper: "#f2eee4",
  mist: "#d5e0d9",
  river: "#1a6557",
  riverDeep: "#0c3a32",
  timber: "#b56536",
  foam: "#f8faf8",
  line: "rgba(16, 26, 23, 0.11)",
  focus: "#2a9d8f",
  shadow: "rgba(12, 58, 50, 0.14)",
  shadowDeep: "rgba(12, 58, 50, 0.28)",
} as const;

export const fonts = {
  display: '"Fraunces", "Songti SC", "Noto Serif SC", Georgia, serif',
  body: '"Sora", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
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
  sm: 6,
  md: 12,
  lg: 20,
} as const;

export const motion = {
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  durationFastMs: 180,
  durationMs: 380,
  durationSlowMs: 560,
} as const;

export const tokens = { brand, colors, fonts, space, radius, motion } as const;
