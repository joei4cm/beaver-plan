"use client";

import Link from "next/link";
import { usePrefersReducedMotion } from "./scroll-motion";

type Props = {
  brandPrimary: string;
  brandSecondary: string;
  headline: string;
  support: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

/**
 * Landing first viewport — Lumen Route brand-first hero.
 * Brand · one headline · one support · one CTA group · full-bleed atmosphere.
 * SoftFailNotice omitted (no soft-fail surface here). No dashboard clutter.
 */
export function LandingHero({
  brandPrimary,
  brandSecondary,
  headline,
  support,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: Props) {
  const reduced = usePrefersReducedMotion();

  return (
    <section
      className="relative isolate min-h-[calc(100dvh-4.5rem)] overflow-hidden"
      aria-label={brandPrimary}
    >
      {/* Full-bleed luminous sky — travel daylight, not purple / cream / atlas night */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 -z-10 ${reduced ? "" : "animate-drift"}`}
        style={{
          backgroundImage: `
            radial-gradient(ellipse 95% 70% at 78% 18%, rgba(47, 107, 255, 0.3), transparent 56%),
            radial-gradient(ellipse 55% 48% at 10% 86%, rgba(96, 165, 250, 0.22), transparent 52%),
            radial-gradient(ellipse 42% 32% at 46% 52%, rgba(219, 232, 255, 0.62), transparent 72%),
            linear-gradient(168deg, #dbe8ff 0%, #eef3fb 36%, #f4f6fa 70%, #ffffff 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="bp-topo pointer-events-none absolute inset-0 -z-10 opacity-[0.55]"
      />

      {/* Atmospheric route plane — path draws, then stop markers pop */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="bp-hero-route-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2F6BFF" stopOpacity="0" />
            <stop offset="35%" stopColor="#2F6BFF" stopOpacity="0.35" />
            <stop offset="70%" stopColor="#60A5FA" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2F6BFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M60 740 C 180 620, 260 680, 360 560 S 520 360, 640 400 S 820 520, 960 340 S 1180 160, 1380 220"
          fill="none"
          stroke="url(#bp-hero-route-glow)"
          strokeWidth="28"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M60 740 C 180 620, 260 680, 360 560 S 520 360, 640 400 S 820 520, 960 340 S 1180 160, 1380 220"
          fill="none"
          stroke="#2F6BFF"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.09"
        />
        <path
          className={reduced ? undefined : "animate-route-draw"}
          d="M60 740 C 180 620, 260 680, 360 560 S 520 360, 640 400 S 820 520, 960 340 S 1180 160, 1380 220"
          fill="none"
          stroke="#2F6BFF"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeDasharray="1"
          strokeDashoffset={reduced ? 0 : 1}
          pathLength={1}
          opacity={reduced ? 0.55 : undefined}
        />
        <g
          className={reduced ? undefined : "animate-marker-pop"}
          style={reduced ? undefined : { animationDelay: "480ms" }}
        >
          <circle cx="360" cy="560" r="11" fill="#FFFFFF" />
          <circle cx="360" cy="560" r="7" fill="#2F6BFF" />
        </g>
        <g
          className={reduced ? undefined : "animate-marker-pop"}
          style={reduced ? undefined : { animationDelay: "620ms" }}
        >
          <circle cx="640" cy="400" r="11" fill="#FFFFFF" />
          <circle cx="640" cy="400" r="7" fill="#2F6BFF" />
        </g>
        <g
          className={reduced ? undefined : "animate-marker-pop"}
          style={reduced ? undefined : { animationDelay: "760ms" }}
        >
          <circle cx="960" cy="340" r="11" fill="#FFFFFF" />
          <circle cx="960" cy="340" r="7" fill="#2F6BFF" />
        </g>
        <g
          className={reduced ? undefined : "animate-marker-pop"}
          style={reduced ? undefined : { animationDelay: "900ms" }}
        >
          <circle cx="1380" cy="220" r="13" fill="#FFFFFF" />
          <circle cx="1380" cy="220" r="8" fill="#0F172A" />
        </g>
      </svg>

      <div className="relative mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-6xl flex-col justify-end px-6 pb-20 pt-10 md:justify-center md:px-10 md:pb-28 md:pt-6">
        <div className="max-w-3xl">
          {/* Azure accent — same Lumen signal as features / how / footer */}
          <span
            aria-hidden
            className={`mb-6 block h-1 w-10 rounded-full bg-river ${reduced ? "" : "animate-fade"}`}
          />
          {/* Brand as hero-level signal — dual-language lockup; passes brand test without nav */}
          <p
            className={`font-display text-base font-semibold tracking-[-0.02em] text-river md:text-lg ${reduced ? "" : "animate-fade"}`}
          >
            {brandSecondary}
          </p>
          <h1
            className={`mt-2 font-display text-[clamp(3.5rem,10vw,6.75rem)] font-extrabold leading-[0.9] tracking-[-0.045em] text-ink ${reduced ? "" : "animate-rise"}`}
          >
            {brandPrimary}
          </h1>
          {/* One headline — quieter than brand so the name stays dominant */}
          <p
            className={`mt-7 max-w-lg font-display text-lg font-semibold leading-snug tracking-[-0.02em] text-ink md:text-2xl ${reduced ? "" : "animate-rise"}`}
            style={reduced ? undefined : { animationDelay: "80ms" }}
          >
            {headline}
          </p>
          {/* One support sentence */}
          <p
            className={`mt-4 max-w-md text-sm leading-relaxed text-ink-soft md:text-base ${reduced ? "" : "animate-rise"}`}
            style={reduced ? undefined : { animationDelay: "140ms" }}
          >
            {support}
          </p>
          {/* One CTA group */}
          <div
            className={`mt-10 flex flex-wrap items-center gap-3 ${reduced ? "" : "animate-rise"}`}
            style={reduced ? undefined : { animationDelay: "200ms" }}
          >
            <Link
              href={primaryHref}
              className="rounded-bp bg-river px-6 py-3.5 text-sm font-semibold tracking-wide text-foam shadow-bp transition duration-bp ease-bp hover:bg-river-deep"
            >
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              className="rounded-bp border border-ink/12 bg-foam/75 px-6 py-3.5 text-sm font-semibold text-ink backdrop-blur-sm transition duration-bp-fast ease-bp hover:border-river/40 hover:text-river"
            >
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>

      {/* Soft horizon into features — atmosphere only, not a card edge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-foam/90"
      />
    </section>
  );
}
