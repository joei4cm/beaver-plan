"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
} from "react";

type Props = {
  children: string;
  className?: string;
  /** Tighter strip for planner sheet footers / nested panels. */
  compact?: boolean;
  /**
   * Presence gate for enter/exit. When false, plays rise-out then unmounts.
   * Default true — omit when the parent only mounts while visible (enter-only).
   */
  open?: boolean;
};

/** Match `--bp-duration` (320ms) + small buffer for animationend misses. */
const EXIT_FALLBACK_MS = 380;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One muted Lumen Route notice for demo / keys-missing / API-absent / offline soft-fail.
 * Mist wash + ink-soft copy — never timber, never raw "Failed to fetch", never purple glow.
 * Enter: easeRise + tip-011 ease-out (#46). Exit: paired ease-in rise-out.
 *
 * A11y depth (BEA-385): `role="status"` + explicit `aria-live="polite"` / `aria-atomic`
 * on the SoftFail mist band. Focus-safe — non-interactive `<p>`, no tabIndex / autofocus,
 * so Soft badge · softSupport · tip-011 mist-band chrome keeps keyboard focus.
 */
export function SoftFailNotice({
  children,
  className,
  compact,
  open = true,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const [text, setText] = useState(children);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      setText(children);
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
  }, [open, children, mounted]);

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
    ? "border-t border-[color:var(--bp-line)] bg-mist/40 px-4 py-2 text-xs leading-relaxed text-ink-soft"
    : "rounded-bp-sm border border-[color:var(--bp-line)] bg-mist/50 px-4 py-3 text-sm leading-relaxed text-ink-soft";
  const motion = exiting ? "animate-rise-out" : "animate-rise";

  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[motion, surface, className].filter(Boolean).join(" ")}
      onAnimationEnd={onAnimationEnd}
      data-notice={exiting ? "out" : "in"}
    >
      {text}
    </p>
  );
}
