"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HEADER_OFFSET_PX,
  scrollScale,
  usePinEnabled,
  usePrefersReducedMotion,
} from "./scroll-motion";

export type StackCard = {
  title: string;
  body: string;
};

/** Lumen Route muted tints — tip 019 stack; last card ink. */
const CARD_TINTS = [
  { bg: "#E8EEF8", ink: "#0F172A", soft: "#64748B", accent: "#2F6BFF" },
  { bg: "#DBE8FF", ink: "#0F172A", soft: "#475569", accent: "#1A4FD6" },
  { bg: "#EEF2F8", ink: "#0F172A", soft: "#64748B", accent: "#2F6BFF" },
  { bg: "#D4E0F5", ink: "#0F172A", soft: "#475569", accent: "#1A4FD6" },
  { bg: "#0F172A", ink: "#F4F6FA", soft: "#94A3B8", accent: "#60A5FA" },
] as const;

type Props = {
  title: string;
  support: string;
  cards: StackCard[];
};

function CardArt({ index, accent }: { index: number; accent: string }) {
  const paths = [
    "M20 180 C 80 120, 120 160, 180 100 S 280 40, 360 70",
    "M40 160 C 100 80, 160 140, 220 90 S 300 30, 380 50",
    "M10 200 C 90 140, 140 180, 210 110 S 310 50, 390 80",
    "M30 170 C 110 100, 150 150, 230 95 S 320 35, 370 60",
    "M15 190 C 95 130, 130 170, 200 105 S 290 45, 385 75",
  ];
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 400 220"
      preserveAspectRatio="xMidYMid slice"
    >
      <path
        d={paths[index % paths.length]}
        fill="none"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.35"
      />
      <circle cx="180" cy="100" r="7" fill="#FFFFFF" opacity="0.9" />
      <circle cx="180" cy="100" r="4" fill={accent} />
      <circle cx="280" cy="55" r="7" fill="#FFFFFF" opacity="0.9" />
      <circle cx="280" cy="55" r="4" fill={accent} />
    </svg>
  );
}

function PlainList({ title, support, cards }: Props) {
  return (
    <section className="border-t border-ink/8 bg-foam">
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base">
          {support}
        </p>
        <ul className="mt-12 divide-y divide-ink/8 border-y border-ink/8">
          {cards.map((card) => (
            <li
              key={card.title}
              className="grid gap-2 py-6 md:grid-cols-[minmax(10rem,14rem)_1fr] md:gap-10 md:py-7"
            >
              <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
                {card.title}
              </span>
              <span className="text-sm leading-relaxed text-ink-soft md:text-base">
                {card.body}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LandingScrollStack({ title, support, cards }: Props) {
  const reduced = usePrefersReducedMotion();
  const pin = usePinEnabled(reduced);
  const sectionRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cardHeight, setCardHeight] = useState(560);
  const [stepPx, setStepPx] = useState(560);
  const [holdPx, setHoldPx] = useState(320);

  const measureAndTick = useCallback(() => {
    const section = sectionRef.current;
    if (!section || !pin) return;

    const vh = window.innerHeight;
    const scale = scrollScale(vh);
    const n = cards.length;
    const strip = 16;
    const stickyBase = HEADER_OFFSET_PX + 40;
    const cardH = Math.min(720, vh - stickyBase - (n - 1) * strip - 32);
    // Tip 019 Standard — ~752px between sticks, scaled to viewport
    const step = 752 * scale;
    const hold = 320 * scale;
    setCardHeight(cardH);
    setStepPx(step);
    setHoldPx(hold);

    const scrollY = window.scrollY || window.pageYOffset;
    const sectionTop = section.offsetTop;
    // Title block ahead of the card list (pt + heading + support + padding)
    const titleBlock = 200;
    const gapAfterCard = Math.max(48, step - cardH);

    let best = 0;
    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      const naturalTop = sectionTop + titleBlock + i * (cardH + gapAfterCard);
      const stuckAt = naturalTop - (stickyBase + i * strip);
      const after = n - 1 - i;
      const k =
        after <= 0
          ? 0
          : Math.min(after, Math.max(0, (scrollY - stuckAt) / step));
      el.style.setProperty("--bp-stack-k", String(k));
      if (scrollY >= stuckAt - 8) best = i;
    });
    setActiveIndex(best);
  }, [cards.length, pin]);

  useEffect(() => {
    if (!pin) return;
    measureAndTick();
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureAndTick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measureAndTick);
    window.addEventListener("orientationchange", measureAndTick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measureAndTick);
      window.removeEventListener("orientationchange", measureAndTick);
    };
  }, [measureAndTick, pin]);

  if (!pin) {
    return <PlainList title={title} support={support} cards={cards} />;
  }

  const n = cards.length;
  const strip = 16;
  const stickyBase = HEADER_OFFSET_PX + 40;
  // Title block + stacked sticky cards + hold after last stick
  const sectionMinHeight =
    stickyBase + 120 + cardHeight + (n - 1) * stepPx + holdPx;

  return (
    <section
      ref={sectionRef}
      className="bp-scroll-stack relative border-t border-ink/8 bg-foam"
      style={{ minHeight: sectionMinHeight }}
      aria-label={title}
    >
      <div className="mx-auto max-w-6xl px-6 pt-16 md:px-10 md:pt-20">
        <header className="max-w-2xl pb-8">
          <h2 className="font-display text-[clamp(2rem,5vw,2.75rem)] font-bold tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base">
            {support}
          </p>
        </header>
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pb-8 md:px-10">
        {cards.map((card, i) => {
          const tint = CARD_TINTS[i % CARD_TINTS.length] ?? CARD_TINTS[0];
          const top = stickyBase + i * strip;
          // Spacer so each card has room to stick before the next arrives
          const marginBottom =
            i < n - 1 ? Math.max(48, stepPx - cardHeight) : holdPx;

          return (
            <article
              key={card.title}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className="bp-scroll-stack__card relative"
              style={{
                position: "sticky",
                top,
                height: cardHeight,
                marginBottom,
                zIndex: i + 1,
                // Keep transform off the sticky node — it breaks stickiness.
              }}
            >
              <div
                className="relative h-full overflow-hidden rounded-bp-xl"
                style={{
                  backgroundColor: tint.bg,
                  transform: "scale(calc(1 - var(--bp-stack-k, 0) * 0.05))",
                  transformOrigin: "top center",
                  willChange: "transform",
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-10"
                  style={{
                    background: `rgba(15, 23, 42, calc(var(--bp-stack-k, 0) * 0.12))`,
                  }}
                />
                <div className="relative grid h-full md:grid-cols-2">
                  <div className="flex flex-col justify-start px-8 pb-8 pt-12 md:px-12 md:pt-14">
                    <h3
                      className="font-display text-[clamp(1.5rem,4vw,2.25rem)] font-bold tracking-[-0.03em]"
                      style={{ color: tint.ink }}
                    >
                      {card.title}
                    </h3>
                    <p
                      className="mt-4 max-w-sm text-sm leading-relaxed md:text-base"
                      style={{ color: tint.soft }}
                    >
                      {card.body}
                    </p>
                  </div>
                  <div className="relative min-h-[9rem] md:min-h-0">
                    <div
                      aria-hidden
                      className="absolute inset-4 overflow-hidden rounded-bp-lg md:inset-6"
                      style={{
                        background:
                          i === n - 1
                            ? "linear-gradient(160deg, #1e293b 0%, #0f172a 100%)"
                            : "linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(47,107,255,0.08) 100%)",
                      }}
                    >
                      <CardArt index={i} accent={tint.accent} />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        <div
          aria-hidden
          className="pointer-events-none sticky bottom-8 z-30 flex justify-center gap-1.5 py-2"
          style={{ top: `calc(100svh - 2.5rem)` }}
        >
          {cards.map((card, i) => (
            <span
              key={card.title}
              className="h-1 rounded-full transition-[background-color,width] duration-bp ease-bp-in-out"
              style={{
                width: activeIndex === i ? "1.25rem" : "0.75rem",
                backgroundColor:
                  activeIndex === i ? "var(--bp-river)" : "rgba(15,23,42,0.15)",
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
