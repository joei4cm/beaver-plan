"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HEADER_OFFSET_PX,
  scrollScale,
  usePinEnabled,
  usePrefersReducedMotion,
} from "./scroll-motion";

export type DeckCard = {
  title: string;
  body: string;
};

const DECK_TINTS = [
  { bg: "#DBE8FF", ink: "#0F172A", soft: "#475569", accent: "#2F6BFF" },
  { bg: "#E8EEF8", ink: "#0F172A", soft: "#64748B", accent: "#1A4FD6" },
  { bg: "#0F172A", ink: "#F4F6FA", soft: "#94A3B8", accent: "#60A5FA" },
] as const;

type Props = {
  title: string;
  support: string;
  cards: DeckCard[];
  ctaLabel: string;
  ctaHref: string;
};

function DeckArt({ index, accent }: { index: number; accent: string }) {
  return (
    <svg
      aria-hidden
      className="h-full w-full"
      viewBox="0 0 360 200"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="360" height="200" fill="transparent" />
      <path
        d={
          index === 0
            ? "M40 160 C 100 90, 140 130, 200 80 S 300 40, 330 70"
            : index === 1
              ? "M30 150 C 110 100, 150 140, 220 85 S 290 35, 340 55"
              : "M20 170 C 90 120, 160 150, 230 90 S 310 30, 350 50"
        }
        fill="none"
        stroke={accent}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.4"
      />
      <circle cx="200" cy="80" r="6" fill="#FFFFFF" />
      <circle cx="200" cy="80" r="3.5" fill={accent} />
      <text
        x="24"
        y="44"
        fill={accent}
        fontSize="42"
        fontFamily="var(--bp-font-display)"
        fontWeight="800"
        opacity="0.35"
      >
        {String(index + 1).padStart(2, "0")}
      </text>
    </svg>
  );
}

function PlainHow({ title, support, cards, ctaLabel, ctaHref }: Props) {
  return (
    <section className="border-t border-ink/8 bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base">
          {support}
        </p>
        <ol className="mt-12 space-y-10 md:space-y-12">
          {cards.map((step, index) => (
            <li key={step.title} className="flex gap-5 md:gap-8">
              <span
                aria-hidden
                className="font-display text-3xl font-extrabold leading-none tracking-[-0.04em] text-river/35 md:text-4xl"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="pt-1">
                <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink md:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft md:text-base">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-14">
          <Link
            href={ctaHref}
            className="inline-flex rounded-bp bg-ink px-6 py-3.5 text-sm font-semibold tracking-wide text-foam transition duration-bp ease-bp hover:bg-river"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function LandingScrollDeck({
  title,
  support,
  cards,
  ctaLabel,
  ctaHref,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const pin = usePinEnabled(reduced);
  const sectionRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [sectionHeight, setSectionHeight] = useState("220svh");
  const [activeIndex, setActiveIndex] = useState(0);
  const [cardMaxH, setCardMaxH] = useState(420);

  const measureAndTick = useCallback(() => {
    const section = sectionRef.current;
    if (!section || !pin) return;

    const vh = window.innerHeight;
    const scale = scrollScale(vh);
    const n = cards.length;
    const throwDist = 420 * scale;
    const hold = 240 * scale;
    const scrollSpan = throwDist * Math.max(0, n - 1) + hold;
    setSectionHeight(`calc(100svh + ${scrollSpan}px)`);
    // Tip 019 §8 — deck fits title + card in viewport
    setCardMaxH(Math.min(456, Math.max(280, vh - HEADER_OFFSET_PX - 220)));

    const scrollY = window.scrollY || window.pageYOffset;
    const start = section.getBoundingClientRect().top + scrollY;
    const progress = Math.max(0, (scrollY - start) / throwDist);
    const thrown = Math.min(n - 1, Math.floor(progress));
    setActiveIndex(Math.min(n - 1, thrown));

    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      // Tip 019 §4 — last card stays; others fly with t = clamp(p - i, 0, 1)
      const isLast = i === n - 1;
      const t = isLast ? 0 : Math.min(1, Math.max(0, progress - i));

      if (t > 0.001) {
        const side = i % 2 === 0 ? 1 : -1;
        const x = side * t * t * 1000;
        const y = t * (160 * t - 40);
        const rotate = side * t * 16;
        el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg)`;
        el.style.filter = "none";
        el.style.opacity = t >= 0.98 ? "0" : "1";
        el.style.visibility = t >= 0.995 ? "hidden" : "visible";
        el.style.pointerEvents = t >= 0.98 ? "none" : "auto";
        return;
      }

      // Still in the pile — depth relative to current top card
      const depth = Math.min(3, Math.max(0, i - thrown));
      el.style.opacity = "1";
      el.style.visibility = "visible";
      el.style.pointerEvents = depth === 0 ? "auto" : "none";
      if (depth === 0) {
        el.style.transform = "translate3d(0, 0, 0) scale(1)";
        el.style.filter = "none";
      } else {
        el.style.transform = `translate3d(0, ${depth * 18}px, 0) scale(${1 - depth * 0.05})`;
        el.style.filter = `brightness(${1 - depth * 0.04})`;
      }
    });
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
    return (
      <PlainHow
        title={title}
        support={support}
        cards={cards}
        ctaLabel={ctaLabel}
        ctaHref={ctaHref}
      />
    );
  }

  return (
    <section
      ref={sectionRef}
      className="bp-scroll-deck relative border-t border-ink/8 bg-paper"
      style={{ height: sectionHeight }}
      aria-label={title}
    >
      <div
        className="sticky flex flex-col items-center justify-center px-6 md:px-10"
        style={{
          top: HEADER_OFFSET_PX,
          height: `calc(100svh - ${HEADER_OFFSET_PX}px)`,
        }}
      >
        <header className="mx-auto mb-10 w-full max-w-xl text-center">
          <h2 className="font-display text-[clamp(2rem,5vw,2.75rem)] font-bold tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft md:text-base">
            {support}
          </p>
        </header>

        <div
          className="relative mx-auto w-full max-w-[27rem]"
          style={{ height: cardMaxH }}
        >
          {cards.map((card, i) => {
            const tint = DECK_TINTS[i % DECK_TINTS.length] ?? DECK_TINTS[0];
            const z = cards.length - i;
            return (
              <article
                key={card.title}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className="bp-scroll-deck__card absolute inset-x-0 top-0 overflow-hidden rounded-bp-xl"
                style={{
                  height: cardMaxH,
                  zIndex: z,
                  backgroundColor: tint.bg,
                  transformOrigin: "bottom center",
                  willChange: "transform, opacity",
                }}
              >
                <div
                  className="m-2 overflow-hidden rounded-bp-lg"
                  style={{
                    height: "42%",
                    background:
                      i === cards.length - 1
                        ? "linear-gradient(160deg, #1e293b, #0f172a)"
                        : "linear-gradient(160deg, rgba(255,255,255,0.65), rgba(47,107,255,0.1))",
                  }}
                >
                  <DeckArt index={i} accent={tint.accent} />
                </div>
                <div className="px-6 pb-6 pt-2">
                  <h3
                    className="font-display text-[clamp(1.35rem,3.5vw,1.75rem)] font-bold tracking-[-0.02em]"
                    style={{ color: tint.ink }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: tint.soft }}
                  >
                    {card.body}
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <div
          aria-hidden
          className="mt-8 flex justify-center gap-1.5"
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

        <div className="mt-10">
          <Link
            href={ctaHref}
            className="inline-flex rounded-bp bg-ink px-6 py-3.5 text-sm font-semibold tracking-wide text-foam transition duration-bp ease-bp hover:bg-river"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
