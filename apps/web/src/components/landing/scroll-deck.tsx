"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import {
  HEADER_OFFSET_PX,
  deckDepthTransform,
  deckHoldDistance,
  deckThrowDistance,
  deckThrowTransform,
  scrollScale,
  usePinEnabled,
  usePrefersReducedMotion,
} from "./scroll-motion";

export type DeckCard = {
  title: string;
  body: string;
};

/** Lumen Route deck tints — azure lead → mist → ink finale. */
const DECK_TINTS = [
  { bg: "#DBE8FF", ink: "#0F172A", soft: "#475569", accent: "#2F6BFF" },
  { bg: "#E8EEF8", ink: "#0F172A", soft: "#64748B", accent: "#2F6BFF" },
  { bg: "#0F172A", ink: "#F4F6FA", soft: "#94A3B8", accent: "#60A5FA" },
] as const;

type Props = {
  title: string;
  support: string;
  cards: DeckCard[];
  ctaLabel: string;
  ctaHref: string;
  offlineNotice: string;
  stepEyebrow: string;
  progressLabel: string;
};

const ROUTE_PATHS = [
  "M36 148 C 90 100, 130 130, 180 88 S 270 40, 330 62",
  "M28 156 C 100 108, 145 140, 200 92 S 280 36, 338 54",
  "M22 164 C 88 118, 155 148, 218 96 S 300 34, 342 48",
] as const;

/** SSR-safe online gate — assume online until mount to avoid hydration mismatch. */
function useBrowserOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}

function DeckArt({
  index,
  accent,
  active,
}: {
  index: number;
  accent: string;
  active: boolean;
}) {
  const path = ROUTE_PATHS[index % ROUTE_PATHS.length] ?? ROUTE_PATHS[0];
  const end = index === 0 ? [330, 62] : index === 1 ? [338, 54] : [342, 48];
  const mid = index === 0 ? [180, 88] : index === 1 ? [200, 92] : [218, 96];

  return (
    <svg
      aria-hidden
      className="h-full w-full"
      viewBox="0 0 360 200"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient
          id={`bp-deck-sky-${index}`}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0%" stopColor="#DBE8FF" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#EEF3FB" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#F4F6FA" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {index < 2 ? (
        <rect width="360" height="200" fill={`url(#bp-deck-sky-${index})`} />
      ) : (
        <rect width="360" height="200" fill="transparent" />
      )}
      <path
        d={path}
        fill="none"
        stroke={accent}
        strokeWidth="9"
        strokeLinecap="round"
        opacity="0.12"
      />
      <path
        className={active ? "animate-route-draw" : undefined}
        d={path}
        fill="none"
        stroke={accent}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1"
        strokeDashoffset={active ? "1" : "0"}
        pathLength={1}
        opacity={active ? undefined : 0.85}
      />
      <g
        className={active ? "animate-marker-pop" : undefined}
        style={active ? { animationDelay: "280ms" } : undefined}
      >
        <circle cx={mid[0]} cy={mid[1]} r="7" fill="#FFFFFF" />
        <circle cx={mid[0]} cy={mid[1]} r="4" fill={accent} />
      </g>
      <g
        className={active ? "animate-marker-pop" : undefined}
        style={active ? { animationDelay: "400ms" } : undefined}
      >
        <circle cx={end[0]} cy={end[1]} r="9" fill="#FFFFFF" />
        <circle
          cx={end[0]}
          cy={end[1]}
          r="5.5"
          fill={index === 2 ? "#F4F6FA" : "#0F172A"}
        />
      </g>
      <text
        x="22"
        y="42"
        fill={accent}
        fontSize="40"
        fontFamily="var(--bp-font-display)"
        fontWeight="800"
        opacity="0.28"
      >
        {String(index + 1).padStart(2, "0")}
      </text>
    </svg>
  );
}

function PlainHow({
  title,
  support,
  cards,
  ctaLabel,
  ctaHref,
  offlineNotice,
  stepEyebrow,
}: Omit<Props, "progressLabel">) {
  const online = useBrowserOnline();
  const reduced = usePrefersReducedMotion();

  return (
    <section className="relative overflow-hidden border-t border-ink/8 bg-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[22rem]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 65% 50% at 82% 6%, rgba(47, 107, 255, 0.1), transparent 58%),
            radial-gradient(ellipse 45% 35% at 10% 50%, rgba(96, 165, 250, 0.07), transparent 55%)
          `,
        }}
      />
      <div className="relative mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <header className="max-w-2xl">
          <span
            aria-hidden
            className="mb-5 block h-1 w-10 rounded-full bg-river"
          />
          <h2 className="font-display text-[clamp(2rem,5vw,2.85rem)] font-bold tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base">
            {support}
          </p>
        </header>

        <div className="mt-8">
          <SoftFailNotice open={!online}>{offlineNotice}</SoftFailNotice>
        </div>

        <ol className="mt-14 space-y-0 border-t border-ink/8">
          {cards.map((step, index) => (
            <li
              key={step.title}
              className={`grid gap-2 border-b border-ink/8 py-7 md:grid-cols-[4.5rem_minmax(10rem,16rem)_1fr] md:items-baseline md:gap-8 md:py-8 ${
                index === 0
                  ? "shadow-[inset_3px_0_0_var(--bp-river)]"
                  : ""
              } ${reduced ? "" : "animate-rise"}`}
              style={
                reduced ? undefined : { animationDelay: `${120 + index * 55}ms` }
              }
            >
              <span
                aria-hidden
                className="pl-1 font-display text-lg font-bold tabular-nums tracking-[-0.03em] text-river md:pl-2 md:text-xl"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-river/80">
                  {stepEyebrow}
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-ink md:text-xl">
                  {step.title}
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-ink-soft md:text-base">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-12">
          <Link
            href={ctaHref}
            className="inline-flex rounded-bp bg-river px-6 py-3.5 text-sm font-semibold tracking-wide text-foam shadow-bp transition duration-bp ease-bp-out-strong hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Tip 019 how-it-works deck — sticky throw cards.
 * Standard throw scrub + tip-011 chrome settle · SoftFail offline · Lumen tokens.
 */
export function LandingScrollDeck({
  title,
  support,
  cards,
  ctaLabel,
  ctaHref,
  offlineNotice,
  stepEyebrow,
  progressLabel,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const pin = usePinEnabled(reduced);
  const online = useBrowserOnline();
  const sectionRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [sectionHeight, setSectionHeight] = useState("220svh");
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress01, setProgress01] = useState(0);
  const [cardMaxH, setCardMaxH] = useState(420);
  const [entered, setEntered] = useState(reduced);

  const measureAndTick = useCallback(() => {
    const section = sectionRef.current;
    if (!section || !pin) return;

    const vh = window.innerHeight;
    const scale = scrollScale(vh);
    const n = cards.length;
    // Tip 019 §4 Standard throw + hold (scaled §8)
    const throwDist = deckThrowDistance(scale);
    const hold = deckHoldDistance(scale);
    const scrollSpan = throwDist * Math.max(0, n - 1) + hold;
    setSectionHeight(`calc(100svh + ${scrollSpan}px)`);
    // Tip 019 §8 — deck fits title + card in viewport
    setCardMaxH(Math.min(456, Math.max(280, vh - HEADER_OFFSET_PX - 220)));

    const scrollY = window.scrollY || window.pageYOffset;
    const start = section.getBoundingClientRect().top + scrollY;
    const progress = Math.max(0, (scrollY - start) / throwDist);
    const thrown = Math.min(n - 1, Math.floor(progress));
    setActiveIndex(Math.min(n - 1, thrown));
    const maxP = Math.max(0.001, n - 1 + hold / throwDist);
    setProgress01(Math.min(1, Math.max(0, progress / maxP)));

    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      // Tip 019 §4 — last card stays; others fly with t = clamp(p - i, 0, 1)
      const isLast = i === n - 1;
      const t = isLast ? 0 : Math.min(1, Math.max(0, progress - i));

      if (t > 0.001) {
        const side = i % 2 === 0 ? 1 : -1;
        const arc = deckThrowTransform(t, side);
        el.style.transform = `translate3d(${arc.x}px, ${arc.y}px, 0) rotate(${arc.rotate}deg)`;
        el.style.filter = "none";
        el.style.opacity = arc.hidden ? "0" : "1";
        el.style.visibility = arc.hidden ? "hidden" : "visible";
        el.style.pointerEvents = t >= 0.97 ? "none" : "auto";
        return;
      }

      // Still in the pile — depth relative to current top card
      const depth = Math.min(3, Math.max(0, i - thrown));
      const pile = deckDepthTransform(depth);
      el.style.opacity = "1";
      el.style.visibility = "visible";
      el.style.pointerEvents = depth === 0 ? "auto" : "none";
      if (depth === 0) {
        el.style.transform = "translate3d(0, 0, 0) scale(1)";
        el.style.filter = "none";
      } else {
        el.style.transform = `translate3d(0, ${pile.y}px, 0) scale(${pile.scale})`;
        el.style.filter = `brightness(${pile.brightness})`;
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

  useEffect(() => {
    if (!pin || reduced) {
      setEntered(true);
      return;
    }
    const section = sectionRef.current;
    if (!section) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setEntered(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(section);
    return () => io.disconnect();
  }, [pin, reduced]);

  if (!pin) {
    return (
      <PlainHow
        title={title}
        support={support}
        cards={cards}
        ctaLabel={ctaLabel}
        ctaHref={ctaHref}
        offlineNotice={offlineNotice}
        stepEyebrow={stepEyebrow}
      />
    );
  }

  const reveal = (delayMs: number) =>
    reduced
      ? undefined
      : {
          animationDelay: `${delayMs}ms`,
        };

  const revealClass =
    reduced || entered
      ? reduced
        ? ""
        : "animate-rise"
      : "opacity-0 translate-y-4";

  return (
    <section
      ref={sectionRef}
      className="bp-scroll-deck relative overflow-hidden border-t border-ink/8 bg-paper"
      style={{ height: sectionHeight }}
      aria-label={title}
    >
      {/* Soft azure wash — atmosphere under the sticky deck */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[40%] min-h-[18rem]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 55% at 78% 10%, rgba(47, 107, 255, 0.11), transparent 60%),
            radial-gradient(ellipse 48% 40% at 12% 55%, rgba(96, 165, 250, 0.07), transparent 55%)
          `,
        }}
      />

      <div
        className="sticky flex flex-col items-center justify-center px-6 md:px-10"
        style={{
          top: HEADER_OFFSET_PX,
          height: `calc(100svh - ${HEADER_OFFSET_PX}px)`,
        }}
      >
        <header
          className={`mx-auto mb-6 w-full max-w-xl text-center md:mb-8 ${revealClass}`}
          style={reveal(0)}
        >
          <span
            aria-hidden
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-river"
          />
          <h2 className="font-display text-[clamp(2rem,5vw,2.85rem)] font-bold tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft md:text-base">
            {support}
          </p>
        </header>

        <div
          className={`mb-5 w-full max-w-xl ${revealClass}`}
          style={reveal(60)}
        >
          <SoftFailNotice open={!online} compact>
            {offlineNotice}
          </SoftFailNotice>
        </div>

        <div
          className={`relative mx-auto w-full max-w-[27rem] ${revealClass}`}
          style={reveal(100)}
        >
          <div className="relative" style={{ height: cardMaxH }}>
            {cards.map((card, i) => {
              const tint = DECK_TINTS[i % DECK_TINTS.length] ?? DECK_TINTS[0];
              const z = cards.length - i;
              const isActive = activeIndex === i;
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
                    boxShadow: isActive
                      ? i === cards.length - 1
                        ? "0 20px 44px rgba(15, 23, 42, 0.24)"
                        : "0 18px 40px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(47, 107, 255, 0.12)"
                      : "0 10px 28px rgba(15, 23, 42, 0.06)",
                  }}
                >
                  {/* Azure lead rail on the live card — hierarchy without card soup */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-full transition duration-bp ease-bp-out-strong"
                    style={{
                      backgroundColor: tint.accent,
                      opacity: isActive ? 0.9 : 0,
                      transform: isActive ? "scaleY(1)" : "scaleY(0.4)",
                    }}
                  />
                  <div
                    className="m-2 overflow-hidden rounded-bp-lg"
                    style={{
                      height: "44%",
                      background:
                        i === cards.length - 1
                          ? "linear-gradient(160deg, #1e293b, #0f172a)"
                          : "linear-gradient(160deg, rgba(255,255,255,0.7), rgba(47,107,255,0.12))",
                    }}
                  >
                    <DeckArt
                      index={i}
                      accent={tint.accent}
                      active={isActive && entered}
                    />
                  </div>
                  <div className="flex flex-col px-6 pb-6 pt-3">
                    <p
                      className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: tint.accent, opacity: 0.9 }}
                    >
                      {stepEyebrow} · {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3
                      className="mt-1.5 font-display text-[clamp(1.35rem,3.5vw,1.75rem)] font-bold tracking-[-0.02em]"
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
        </div>

        {/* Tip 019 §2 — quiet progress: thin bar + dots (tip-011 settle on chrome) */}
        <div
          className={`mt-7 w-full max-w-[14rem] md:mt-8 ${revealClass}`}
          style={reveal(140)}
          role="group"
          aria-label={progressLabel}
        >
          <div
            className="mx-auto h-0.5 overflow-hidden rounded-full bg-ink/10"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-river transition-[width] duration-bp ease-bp-out-strong"
              style={{ width: `${Math.round(progress01 * 100)}%` }}
            />
          </div>
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {cards.map((card, i) => (
              <span
                key={card.title}
                className="h-1 rounded-full transition-[background-color,width] duration-bp ease-bp-out-strong"
                style={{
                  width: activeIndex === i ? "1.35rem" : "0.7rem",
                  backgroundColor:
                    activeIndex === i
                      ? "var(--bp-river)"
                      : "rgba(15, 23, 42, 0.14)",
                }}
              />
            ))}
          </div>
        </div>

        <div className={`mt-8 md:mt-9 ${revealClass}`} style={reveal(180)}>
          <Link
            href={ctaHref}
            className="inline-flex rounded-bp bg-river px-6 py-3.5 text-sm font-semibold tracking-wide text-foam shadow-bp transition duration-bp ease-bp-out-strong hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
