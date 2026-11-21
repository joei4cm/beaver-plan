"use client";

import { useEffect, useState } from "react";

/** Tip 019 §8 — nothing pins below this viewport height. */
export const SHORT_VIEWPORT_PX = 560;

/** Tip 019 Standard preset, scaled by viewport height / 896. */
export function scrollScale(viewportHeight: number): number {
  return Math.min(1.2, Math.max(0.7, viewportHeight / 896));
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
