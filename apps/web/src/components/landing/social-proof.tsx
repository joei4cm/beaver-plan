"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./scroll-motion";

export type TrustSignal = {
  label: string;
  detail: string;
};

type Props = {
  title: string;
  support: string;
  quote: string;
  attribution: string;
  signals: TrustSignal[];
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
      { threshold: 0.16, rootMargin: "0px 0px -4% 0px" },
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

/**
 * Landing trust / social proof — sits below the hero.
 * One job: quiet confidence. Azure hierarchy, editorial quote + signal rail.
 * SoftFailNotice omitted (no soft-fail surface). No card clutter (#46 easing).
 */
export function LandingSocialProof({
  title,
  support,
  quote,
  attribution,
  signals,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const { ref, visible } = useSectionReveal(reduced);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden border-t border-ink/8 bg-paper"
      aria-label={title}
    >
      {/* Quiet azure wash — atmosphere only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[18rem]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 50% at 12% 0%, rgba(47, 107, 255, 0.1), transparent 58%),
            radial-gradient(ellipse 45% 40% at 92% 30%, rgba(96, 165, 250, 0.07), transparent 55%)
          `,
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20">
        <header className="max-w-2xl">
          <div
            className={revealClass(visible, reduced)}
            style={reduced ? undefined : { animationDelay: "0ms" }}
          >
            <span
              aria-hidden
              className="mb-5 block h-1 w-10 rounded-full bg-river"
            />
            <h2 className="font-display text-[clamp(1.75rem,4vw,2.35rem)] font-bold tracking-[-0.03em] text-ink">
              {title}
            </h2>
          </div>
          <p
            className={`mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base ${revealClass(visible, reduced)}`}
            style={reduced ? undefined : { animationDelay: "60ms" }}
          >
            {support}
          </p>
        </header>

        {/* Lead quote — typography plane, not a bordered card */}
        <blockquote
          className={`mt-12 max-w-3xl border-l-2 border-river/40 pl-6 md:mt-14 md:pl-8 ${revealClass(visible, reduced)}`}
          style={reduced ? undefined : { animationDelay: "120ms" }}
        >
          <p className="font-display text-[clamp(1.35rem,3.2vw,1.85rem)] font-semibold leading-snug tracking-[-0.025em] text-ink">
            {quote}
          </p>
          <footer className="mt-5 text-sm font-semibold tracking-[-0.01em] text-river">
            {attribution}
          </footer>
        </blockquote>

        {/* Trust signals — hairline rail, no card soup */}
        {signals.length > 0 ? (
          <ul className="mt-14 grid gap-0 border-t border-ink/8 md:mt-16 md:grid-cols-3">
            {signals.map((signal, index) => {
              const delay = 180 + index * 70;
              return (
                <li
                  key={signal.label}
                  className={`border-b border-ink/8 py-6 md:border-b-0 md:border-r md:border-ink/8 md:px-6 md:py-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0 ${revealClass(visible, reduced)}`}
                  style={
                    reduced ? undefined : { animationDelay: `${delay}ms` }
                  }
                >
                  <p className="font-display text-lg font-bold tracking-[-0.02em] text-ink md:text-xl">
                    {signal.label}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {signal.detail}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
