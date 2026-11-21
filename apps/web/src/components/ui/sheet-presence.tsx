"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Shared planner sheet enter/exit (BEA-90).
 * Uses #46 / tip-011 role tokens: entrances → ease-out, exits → ease-in.
 */
export type SheetPresenceVariant = "sheet" | "popover";

type Props = {
  open: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: SheetPresenceVariant;
  /** Element tag — search results use `ul`. */
  as?: "div" | "ul";
  role?: string;
  id?: string;
  "aria-label"?: string;
};

const IN_CLASS: Record<SheetPresenceVariant, string> = {
  sheet: "animate-sheet-in",
  popover: "bp-popover",
};

const OUT_CLASS: Record<SheetPresenceVariant, string> = {
  sheet: "animate-sheet-out",
  popover: "bp-popover-out",
};

/** Match `--bp-duration` (320ms) + small buffer for animationend misses. */
const EXIT_FALLBACK_MS = 380;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SheetPresence({
  open,
  children,
  className = "",
  style,
  variant = "sheet",
  as = "div",
  role,
  id,
  "aria-label": ariaLabel,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    if (open) {
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
  }, [open, mounted]);

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

  const onAnimationEnd = useCallback((e: AnimationEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!openRef.current) {
      setMounted(false);
      setExiting(false);
    }
  }, []);

  if (!mounted) return null;

  const motionClass = exiting ? OUT_CLASS[variant] : IN_CLASS[variant];
  const classNames = [motionClass, className].filter(Boolean).join(" ");
  const dataSheet = exiting ? "out" : "in";

  if (as === "ul") {
    return (
      <ul
        id={id}
        role={role}
        aria-label={ariaLabel}
        className={classNames}
        style={style}
        onAnimationEnd={onAnimationEnd}
        data-sheet={dataSheet}
      >
        {children}
      </ul>
    );
  }

  return (
    <div
      id={id}
      role={role}
      aria-label={ariaLabel}
      className={classNames}
      style={style}
      onAnimationEnd={onAnimationEnd}
      data-sheet={dataSheet}
    >
      {children}
    </div>
  );
}
