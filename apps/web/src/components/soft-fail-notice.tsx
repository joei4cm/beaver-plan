"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
} from "react";

type SoftFailBand = "under" | "footer";

type Props = {
  children: string;
  className?: string;
  /** Tighter strip for planner sheet footers / nested panels. */
  compact?: boolean;
  /**
   * Compact edge treatment.
   * - `under` (default): tip-011 mist band under an azure rail (`border-b`).
   * - `footer`: legacy top-rule strip at the bottom of a card (`border-t`).
   */
  band?: SoftFailBand;
  /**
   * Presence gate for enter/exit. When false, plays rise-out then unmounts.
   * Default true — omit when the parent only mounts while visible (enter-only).
   */
  open?: boolean;
  /**
   * Safe copy when `children` is raw transport noise ("Failed to fetch", etc.).
   * SoftFailNotice never paints timber or raw network errors as defaults.
   */
  fallback?: string;
};

/** Match `--bp-duration` (320ms) + small buffer for animationend misses. */
const EXIT_FALLBACK_MS = 380;

/** Soft badge chip — mist / ink-soft while SoftFail owns an azure rail. */
export const softFailBadgeClass =
  "rounded-bp-xs bg-mist px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft bp-transition";

/** softSupport line under an azure rail title while SoftFail owns. */
export const softFailSupportClass =
  "min-w-0 text-[11px] leading-snug text-ink-soft/80";

/** tip-011 mist-wash body / CTA track under a SoftFail mist band. */
export const softFailMistWashClass =
  "bg-gradient-to-b from-mist/25 via-mist/10 to-transparent";

/** Azure rail wash while SoftFail owns (mist + river inset). */
export const softFailRailClass =
  "bg-mist/35 shadow-[inset_3px_0_0_var(--bp-river)]";

/**
 * Raw browser / transport noise SoftFailNotice must never paint as copy.
 * Exact / near-exact messages only — i18n that mentions "Failed to fetch"
 * as reassurance stays intact.
 */
export function isRawSoftFailNoise(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (/^failed to fetch\.?$/i.test(text)) return true;
  if (/^network request failed\.?$/i.test(text)) return true;
  if (/^load[_ ]failed\.?$/i.test(text)) return true;
  if (/^typeerror:/i.test(text)) return true;
  if (/^econnrefused/i.test(text)) return true;
  if (/^(error:\s*)?(network\s*)?error\.?$/i.test(text)) return true;
  return false;
}

/** Prefer soft i18n copy over raw transport noise. */
export function sanitizeSoftFailCopy(
  message: string,
  fallback = "",
): string {
  return isRawSoftFailNoise(message) ? fallback : message;
}

/** Soft badge composition helper — Lumen mist chip, never timber. */
export function SoftFailBadge({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <span className={[softFailBadgeClass, className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}

/** softSupport composition helper — ink-soft line beside azure rail titles. */
export function SoftFailSupport({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <span
      className={[softFailSupportClass, className].filter(Boolean).join(" ")}
    >
      {children}
    </span>
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function compactSurface(band: SoftFailBand): string {
  // tip-011 mist-band default under azure rails — border-b, mist/40, ink-soft.
  if (band === "footer") {
    return "border-t border-[color:var(--bp-line)] bg-mist/40 px-4 py-2 text-xs leading-relaxed text-ink-soft";
  }
  return "border-b border-[color:var(--bp-line)] bg-mist/40 px-4 py-2 text-xs leading-relaxed text-ink-soft";
}

/**
 * One muted Lumen Route notice for demo / keys-missing / API-absent / offline soft-fail.
 * Mist wash + ink-soft copy — never timber, never raw "Failed to fetch", never purple glow.
 * Compact defaults to tip-011 mist band (`border-b`) under azure rails.
 * Enter: easeRise + tip-011 ease-out (#46). Exit: paired ease-in rise-out.
 */
export function SoftFailNotice({
  children,
  className,
  compact,
  band = "under",
  open = true,
  fallback = "",
}: Props) {
  const safeChildren = sanitizeSoftFailCopy(children, fallback);
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const [text, setText] = useState(safeChildren);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      setText(sanitizeSoftFailCopy(children, fallback));
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      setExiting(false);
      return;
    }
    setExiting(true);
  }, [open, children, fallback, mounted]);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => {
      if (!openRef.current) {
        setMounted(false);
        setExiting(false);
      }
    }, EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  const onAnimationEnd = useCallback((e: AnimationEvent<HTMLParagraphElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!openRef.current) {
      setMounted(false);
      setExiting(false);
    }
  }, []);

  if (!mounted) return null;

  const surface = compact
    ? compactSurface(band)
    : "rounded-bp-sm border border-[color:var(--bp-line)] bg-mist/50 px-4 py-3 text-sm leading-relaxed text-ink-soft";
  const motion = exiting ? "animate-rise-out" : "animate-rise";

  return (
    <p
      role="status"
      className={[motion, surface, className].filter(Boolean).join(" ")}
      onAnimationEnd={onAnimationEnd}
      data-notice={exiting ? "out" : "in"}
      data-soft-band={compact ? band : "card"}
    >
      {text}
    </p>
  );
}
