"use client";

import { useEffect, useState } from "react";

/** Tip 019 §8 — nothing pins below this viewport height. */
export const SHORT_VIEWPORT_PX = 560;

/** Tip 019 Standard preset, scaled by viewport height / 896. */
export function scrollScale(viewportHeight: number): number {
  return Math.min(1.2, Math.max(0.7, viewportHeight / 896));
}

/** Tip 019 §4 Standard — px of scroll that throws one card. */
export function deckThrowDistance(scale: number): number {
  return 420 * scale;
}

/** Tip 019 §4 Standard — hold after the last throw so art can settle. */
export function deckHoldDistance(scale: number): number {
  return 240 * scale;
}

/**
 * Tip 019 §4 Standard throw arc (scroll-driven, not timed).
 * t ∈ [0,1]; side = ±1. Tip 011 out-strong is reserved for chrome settles
 * (dots / CTA), not the scroll-scrubbed path.
 */
export function deckThrowTransform(
  t: number,
  side: number,
): { x: number; y: number; rotate: number; hidden: boolean } {
  const clamped = Math.min(1, Math.max(0, t));
  const x = side * clamped * clamped * 1000;
  const y = clamped * (160 * clamped - 40);
  const rotate = side * clamped * 16;
  return {
    x,
    y,
    rotate,
    hidden: clamped >= 0.99,
  };
}

/** Tip 019 §4 — cards below the top sit back in the pile. */
export function deckDepthTransform(depth: number): {
  y: number;
  scale: number;
  brightness: number;
} {
  const d = Math.min(3, Math.max(0, depth));
  return {
    y: d * 18,
    scale: 1 - d * 0.05,
    brightness: 1 - d * 0.04,
  };
}

function readReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readPinOk(): boolean {
  if (typeof window === "undefined") return true;
  return window.innerHeight >= SHORT_VIEWPORT_PX;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/**
 * Tip 019 §8 — short windows disable pin; ignore toolbar-only height jitter
 * under ~120px when width is unchanged.
 */
export function usePinEnabled(reducedMotion: boolean): boolean {
  const [enabled, setEnabled] = useState(readPinOk);

  useEffect(() => {
    if (reducedMotion) {
      setEnabled(false);
      return;
    }

    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    const sync = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const widthChanged = w !== lastWidth;
      const heightDelta = Math.abs(h - lastHeight);
      if (!widthChanged && heightDelta > 0 && heightDelta < 120) {
        return;
      }
      lastWidth = w;
      lastHeight = h;
      setEnabled(h >= SHORT_VIEWPORT_PX);
    };

    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [reducedMotion]);

  return enabled && !reducedMotion;
}

/** Header chrome height used by sticky offsets (matches hero 4.5rem). */
export const HEADER_OFFSET_PX = 72;
