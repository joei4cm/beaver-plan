/** Shared design tokens for Beaver Plan / 海狸旅行. */

export const brand = {
  en: "Beaver Plan",
  zh: "海狸旅行",
  taglineZh: "地图上认真规划的一次旅行",
  taglineEn: "Plan a trip worth walking",
} as const;

export const colors = {
  ink: "#14201c",
  inkSoft: "#2a3a34",
  paper: "#f3efe6",
  mist: "#d8e2dc",
  river: "#1f6b5c",
  riverDeep: "#0f4339",
  timber: "#b86b3c",
  foam: "#f7faf8",
  line: "rgba(20, 32, 28, 0.12)",
  focus: "#2a9d8f",
} as const;

export const fonts = {
  display: '"Fraunces", "Songti SC", "Noto Serif SC", Georgia, serif',
  body: '"Sora", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

export const motion = {
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  durationMs: 420,
} as const;

export const tokens = { brand, colors, fonts, motion } as const;
