"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./scroll-motion";

type Props = {
  brandPrimary: string;
  brandSecondary: string;
  title: string;
  support: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  navTrips: string;
  navTranslate: string;
  navSettings: string;
  meta: string;
};

function useSectionReveal(reduced: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -4% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return { ref, visible };
}

function revealClass(visible: boolean, reduced: boolean): string {
  if (reduced) return "";
  return visible ? "animate-rise" : "opacity-0 translate-y-4";
}

/** Quiet route plane — finale atmosphere, not a bordered card. */
function FinaleRouteArt() {
  return (
    <svg
      aria-hidden
      className="h-full w-full"
      viewBox="0 0 640 280"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="bp-footer-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DBE8FF" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#EEF3FB" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#F4F6FA" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect width="640" height="280" fill="url(#bp-footer-sky)" />
      <path
        d="M28 210 C 120 150, 170 190, 250 130 S 390 50, 470 78 S 560 130, 620 100"
        fill="none"
        stroke="#2F6BFF"
        strokeWidth="12"
        strokeLinecap="round"
        opacity="0.1"
      />
      <path
        className="animate-route-draw"
        d="M28 210 C 120 150, 170 190, 250 130 S 390 50, 470 78 S 560 130, 620 100"
        fill="none"
        stroke="#2F6BFF"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeDasharray="1"
        strokeDashoffset="1"
        pathLength={1}
      />
      <g className="animate-marker-pop" style={{ animationDelay: "420ms" }}>
        <circle cx="250" cy="130" r="9" fill="#FFFFFF" />
        <circle cx="250" cy="130" r="5.5" fill="#2F6BFF" />
      </g>
      <g className="animate-marker-pop" style={{ animationDelay: "560ms" }}>
        <circle cx="470" cy="78" r="9" fill="#FFFFFF" />
        <circle cx="470" cy="78" r="5.5" fill="#2F6BFF" />
      </g>
      <g className="animate-marker-pop" style={{ animationDelay: "700ms" }}>
        <circle cx="620" cy="100" r="11" fill="#FFFFFF" />
        <circle cx="620" cy="100" r="6.5" fill="#0F172A" />
      </g>
    </svg>
  );
}

/**
 * Landing finale — Lumen Route CTA + quiet site footer.
 * Paper / azure / Bricolage; #46 rise stagger; no card soup.
 */
export function LandingFooterCta({
  brandPrimary,
  brandSecondary,
  title,
  support,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  navTrips,
  navTranslate,
  navSettings,
  meta,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const { ref, visible } = useSectionReveal(reduced);

  return (
    <footer
      ref={ref}
      className="relative overflow-hidden border-t border-ink/8 bg-paper"
    >
      {/* Soft azure wash — atmosphere under the final CTA */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[26rem]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 72% 55% at 18% 8%, rgba(47, 107, 255, 0.14), transparent 58%),
            radial-gradient(ellipse 50% 40% at 92% 35%, rgba(96, 165, 250, 0.09), transparent 55%)
          `,
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-20 md:px-10 md:pt-28">
        {/* Final CTA — one composition */}
        <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-16">
          <div>
            <div
              className={revealClass(visible, reduced)}
              style={reduced ? undefined : { animationDelay: "0ms" }}
            >
              <span
                aria-hidden
                className="mb-5 block h-1 w-10 rounded-full bg-river"
              />
              <p className="font-display text-base font-semibold tracking-[-0.02em] text-river md:text-lg">
                {brandSecondary}
              </p>
              <h2 className="mt-2 font-display text-[clamp(2.35rem,6vw,3.5rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-ink">
                {title}
              </h2>
            </div>
            <p
              className={`mt-4 max-w-md text-sm leading-relaxed text-ink-soft md:text-base ${revealClass(visible, reduced)}`}
              style={reduced ? undefined : { animationDelay: "80ms" }}
            >
              {support}
            </p>
            <div
              className={`mt-9 flex flex-wrap items-center gap-3 ${revealClass(visible, reduced)}`}
              style={reduced ? undefined : { animationDelay: "160ms" }}
            >
              <Link
                href={primaryHref}
                className="rounded-bp bg-river px-6 py-3.5 text-sm font-semibold tracking-wide text-foam shadow-bp transition duration-bp ease-bp hover:bg-river-deep"
              >
                {primaryLabel}
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-bp border border-ink/12 bg-foam/80 px-6 py-3.5 text-sm font-semibold text-ink backdrop-blur-sm transition duration-bp-fast ease-bp hover:border-river/40 hover:text-river"
              >
                {secondaryLabel}
              </Link>
            </div>
          </div>

          <div
            aria-hidden
            className={`relative aspect-[16/9] overflow-hidden rounded-bp-lg bg-mist/50 md:aspect-auto md:min-h-[14rem] ${revealClass(visible, reduced)}`}
            style={reduced ? undefined : { animationDelay: "120ms" }}
          >
            <FinaleRouteArt />
          </div>
        </div>

        {/* Quiet site rail — brand + nav; hairline only */}
        <div
          className={`mt-20 flex flex-col gap-8 border-t border-ink/8 py-10 md:mt-24 md:flex-row md:items-end md:justify-between md:gap-10 md:py-12 ${revealClass(visible, reduced)}`}
          style={reduced ? undefined : { animationDelay: "220ms" }}
        >
          <div>
            <p className="font-display text-xl font-bold tracking-[-0.03em] text-ink md:text-2xl">
              {brandPrimary}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft/70">
              {brandSecondary}
            </p>
            <p className="mt-4 max-w-xs text-xs leading-relaxed text-ink-soft">
              {meta}
            </p>
          </div>
          <nav
            aria-label={brandPrimary}
            className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-ink-soft"
          >
            <Link
              href="/trips"
              className="transition duration-bp-fast ease-bp hover:text-river"
            >
              {navTrips}
            </Link>
            <Link
              href="/translate"
              className="transition duration-bp-fast ease-bp hover:text-river"
            >
              {navTranslate}
            </Link>
            <Link
              href="/settings"
              className="transition duration-bp-fast ease-bp hover:text-river"
            >
              {navSettings}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
