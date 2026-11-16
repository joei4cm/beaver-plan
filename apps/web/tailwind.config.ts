import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--bp-ink)",
        "ink-soft": "var(--bp-ink-soft)",
        paper: "var(--bp-paper)",
        mist: "var(--bp-mist)",
        river: "var(--bp-river)",
        "river-deep": "var(--bp-river-deep)",
        timber: "var(--bp-timber)",
        foam: "var(--bp-foam)",
      },
      fontFamily: {
        display: ["var(--bp-font-display)"],
        body: ["var(--bp-font-body)"],
      },
      transitionTimingFunction: {
        bp: "var(--bp-ease)",
      },
    },
  },
  plugins: [],
};

export default config;
