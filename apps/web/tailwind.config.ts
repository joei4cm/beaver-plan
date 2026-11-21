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
        focus: "var(--bp-focus)",
      },
      fontFamily: {
        display: ["var(--bp-font-display)"],
        body: ["var(--bp-font-body)"],
      },
      borderRadius: {
        "bp-xs": "var(--bp-radius-xs)",
        "bp-sm": "var(--bp-radius-sm)",
        bp: "var(--bp-radius-md)",
        "bp-lg": "var(--bp-radius-lg)",
        "bp-xl": "var(--bp-radius-xl)",
      },
      boxShadow: {
        bp: "0 18px 40px -24px var(--bp-shadow-deep)",
        "bp-soft": "0 10px 28px -18px var(--bp-shadow)",
      },
      transitionTimingFunction: {
        bp: "var(--bp-ease)",
        "bp-out": "var(--bp-ease-out)",
        "bp-out-strong": "var(--bp-ease-out-strong)",
        "bp-in": "var(--bp-ease-in)",
        "bp-in-out": "var(--bp-ease-in-out)",
        "bp-overshoot": "var(--bp-ease-overshoot)",
      },
      transitionDuration: {
        bp: "var(--bp-duration)",
        "bp-fast": "var(--bp-duration-fast)",
        "bp-slow": "var(--bp-duration-slow)",
      },
    },
  },
  plugins: [],
};

export default config;
