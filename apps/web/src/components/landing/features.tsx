"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./scroll-motion";

export type FeatureItem = {
  title: string;
  body: string;
};

type Props = {
  title: string;
  support: string;
  items: FeatureItem[];
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
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
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

/** Azure route plane for the lead feature — wash + path, not a bordered card. */
function LeadRouteArt() {
  return (
    <svg
      aria-hidden
      className="h-full w-full"
      viewBox="0 0 520 320"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="bp-feat-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DBE8FF" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#EEF3FB" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#F4F6FA" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect width="520" height="320" fill="url(#bp-feat-sky)" />
      <path
        d="M36 248 C 110 190, 150 220, 210 160 S 320 70, 390 96 S 460 150, 500 120"
        fill="none"
        stroke="#2F6BFF"
        strokeWidth="10"
        strokeLinecap="round"
        opacity="0.1"
      />
      <path
        className="animate-route-draw"
        d="M36 248 C 110 190, 150 220, 210 160 S 320 70, 390 96 S 460 150, 500 120"
        fill="none"
        stroke="#2F6BFF"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeDasharray="1"
        strokeDashoffset="1"
        pathLength={1}
      />
      <g className="animate-marker-pop" style={{ animationDelay: "420ms" }}>
        <circle cx="210" cy="160" r="9" fill="#FFFFFF" />
        <circle cx="210" cy="160" r="5.5" fill="#2F6BFF" />
      </g>
      <g className="animate-marker-pop" style={{ animationDelay: "560ms" }}>
        <circle cx="390" cy="96" r="9" fill="#FFFFFF" />
        <circle cx="390" cy="96" r="5.5" fill="#2F6BFF" />
      </g>
      <g className="animate-marker-pop" style={{ animationDelay: "700ms" }}>
        <circle cx="500" cy="120" r="11" fill="#FFFFFF" />
        <circle cx="500" cy="120" r="6.5" fill="#0F172A" />
      </g>
    </svg>
  );
}

/**
 * Mid-page features — Lumen Route editorial hierarchy.
 * Lead map feature + numbered rows; azure accents; stagger enter; no card soup.
 */
export function LandingFeatures({ title, support, items }: Props) {
  const reduced = usePrefersReducedMotion();
  const { ref, visible } = useSectionReveal(reduced);

  const [lead, ...rest] = items;
  if (!lead) return null;

  return (
    <section
      ref={ref}
      className="relative overflow-hidden border-t border-ink/8 bg-foam"
      aria-label={title}
    >
      {/* Soft azure wash — atmosphere, not a decorative gradient hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[28rem]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 55% at 88% 8%, rgba(47, 107, 255, 0.12), transparent 60%),
            radial-gradient(ellipse 50% 40% at 8% 40%, rgba(96, 165, 250, 0.08), transparent 55%)
          `,
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <header className="max-w-2xl">
          <div
            className={revealClass(visible, reduced)}
            style={reduced ? undefined : { animationDelay: "0ms" }}
          >
            <span
              aria-hidden
              className="mb-5 block h-1 w-10 rounded-full bg-river"
            />
            <h2 className="font-display text-[clamp(2rem,5vw,2.85rem)] font-bold tracking-[-0.03em] text-ink">
              {title}
            </h2>
          </div>
          <p
            className={`mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base ${revealClass(visible, reduced)}`}
            style={reduced ? undefined : { animationDelay: "70ms" }}
          >
            {support}
          </p>
        </header>

        {/* Lead feature — one composition, azure route plane */}
        <div
          className={`mt-14 grid items-center gap-10 md:mt-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-14 ${revealClass(visible, reduced)}`}
          style={reduced ? undefined : { animationDelay: "140ms" }}
        >
          <div>
            <p
              aria-hidden
              className="font-display text-4xl font-extrabold leading-none tracking-[-0.05em] text-river/30 md:text-5xl"
            >
              01
            </p>
            <h3 className="mt-4 font-display text-[clamp(1.65rem,3.5vw,2.35rem)] font-bold tracking-[-0.03em] text-ink">
              {lead.title}
            </h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft md:text-base">
              {lead.body}
            </p>
          </div>
          <div
            aria-hidden
            className="relative aspect-[13/8] overflow-hidden rounded-bp-lg bg-mist/60 md:aspect-auto md:min-h-[16rem]"
          >
            <LeadRouteArt />
          </div>
        </div>

        {/* Secondary pillars — editorial rows, hairlines only */}
        {rest.length > 0 ? (
          <ul className="mt-16 border-t border-ink/8 md:mt-20">
            {rest.map((item, index) => {
              const n = index + 2;
              const delay = 200 + index * 70;
              return (
                <li
                  key={item.title}
                  className={`grid gap-2 border-b border-ink/8 py-7 md:grid-cols-[4.5rem_minmax(10rem,15rem)_1fr] md:items-baseline md:gap-8 md:py-8 ${revealClass(visible, reduced)}`}
                  style={reduced ? undefined : { animationDelay: `${delay}ms` }}
                >
                  <span
                    aria-hidden
                    className="font-display text-lg font-bold tabular-nums tracking-[-0.03em] text-river md:text-xl"
                  >
                    {String(n).padStart(2, "0")}
                  </span>
                  <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink md:text-xl">
                    {item.title}
                  </span>
                  <span className="text-sm leading-relaxed text-ink-soft md:text-base">
                    {item.body}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
