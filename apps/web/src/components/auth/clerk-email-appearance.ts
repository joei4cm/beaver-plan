import { colors, radius } from "@beaver/ui-tokens";

/**
 * Clerk email SignIn / SignUp sheet — Lumen Route craft (BEA-498 / wave 52).
 * Beyond WeChat page chrome (#345 / BEA-472): provider vars were still
 * pre-Lumen teal/cream; form elements get type · tokens · tip-011 press.
 * SoftFail out of scope.
 */
export const clerkEmailVariables = {
  colorPrimary: colors.river,
  colorBackground: colors.foam,
  colorText: colors.ink,
  colorTextSecondary: colors.inkSoft,
  colorInputBackground: colors.paper,
  colorInputText: colors.ink,
  colorDanger: colors.timber,
  borderRadius: `${radius.sm}px`,
  fontFamily: "var(--bp-font-body)",
  fontFamilyButtons: "var(--bp-font-body)",
} as const;

/** Shared email-form chrome for SignIn / SignUp panels (+ modal inherit). */
export const clerkEmailElements = {
  rootBox: "w-full",
  card: "shadow-none border border-[color:var(--bp-line)] bg-foam/80 rounded-bp",
  headerTitle:
    "font-display text-xl font-semibold tracking-tight text-ink",
  headerSubtitle: "text-sm leading-relaxed text-ink-soft",
  formFieldLabel:
    "text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river",
  formFieldInput:
    "rounded-bp-sm border border-[color:var(--bp-line)] bg-paper/80 text-sm text-ink transition duration-bp-fast ease-bp-out focus:border-river/40",
  formButtonPrimary:
    "rounded-bp bg-river text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98]",
  footerActionLink: "font-semibold text-river",
  identityPreviewEditButton: "font-semibold text-river",
  formFieldAction: "text-sm font-semibold text-river",
} as const;
