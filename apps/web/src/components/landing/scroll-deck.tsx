"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
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
  focusLabel: string;
  liveBadge: string;
  sheetEyebrow: string;
  sheetSupport: string;
  softSupport: string;
  softBadge: string;
  softLiveBadge: string;
};

/**
 * How SoftFail sheet — azure section rail · Soft/Live badge · softSupport ·
 * compact SoftFailNotice mist band (`border-b`) · tip-011 mist-wash
 * SheetPresence body (step rail / PlainHow rows). Tip-019 throw cards stay
 * outside when provided as a sibling — SoftFail yields if a child owned it
 * (none today). Never timber / Failed to fetch.
 */
function HowSoftFailSheet({
  softOpen,
  sheetEyebrow,
  sheetSupport,
  softSupport,
  softBadge,
  softLiveBadge,
  offlineNotice,
  bodyLabel,
  dense,
  className,
  children,
}: {
  softOpen: boolean;
  sheetEyebrow: string;
  sheetSupport: string;
  softSupport: string;
  softBadge: string;
  softLiveBadge: string;
  offlineNotice: string;
  bodyLabel: string;
  /** Tighter body padding for tip-019 sticky deck viewport budget. */
  dense?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const pad = dense
    ? "px-3 py-3 sm:px-4 sm:py-3.5"
    : "px-4 py-5 sm:px-5 sm:py-6";
  return (
    <div
      className={`overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft ${className ?? ""}`}
      aria-label={sheetEyebrow}
    >
      <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)] sm:px-5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
            {sheetEyebrow}
          </span>
          <span className="text-[11px] leading-snug text-ink-soft/80">
            {softOpen ? softSupport : sheetSupport}
          </span>
        </div>
        <span
          className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
            softOpen ? "bg-mist text-ink-soft" : "bg-river/12 text-river"
          }`}
        >
          {softOpen ? softBadge : softLiveBadge}
        </span>
      </header>
      {/* Compact SoftFail under azure rail — mist band + border-b depth. */}
      <SoftFailNotice
        open={softOpen}
        compact
        className="border-b border-[color:var(--bp-line)]"
      >
        {offlineNotice}
      </SoftFailNotice>

      <SheetPresence
        open
        role="group"
        className={`${pad} ${
          softOpen
            ? "bg-gradient-to-b from-mist/25 via-mist/10 to-transparent"
            : ""
        }`}
        style={{ animationDelay: "40ms" }}
        aria-label={bodyLabel}
      >
        {children}
      </SheetPresence>
    </div>
  );
}

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
  const uid = useId().replace(/:/g, "");
  const path = ROUTE_PATHS[index % ROUTE_PATHS.length] ?? ROUTE_PATHS[0];
  const end = index === 0 ? [330, 62] : index === 1 ? [338, 54] : [342, 48];
  const mid = index === 0 ? [180, 88] : index === 1 ? [200, 92] : [218, 96];
  const finale = index === 2;

  return (
    <svg
      aria-hidden
      className="h-full w-full"
      viewBox="0 0 360 200"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient
          id={`bp-deck-sky-${uid}`}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0%" stopColor="#DBE8FF" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#EEF3FB" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#F4F6FA" stopOpacity="0.15" />
        </linearGradient>
        <radialGradient
          id={`bp-deck-glow-${uid}`}
          cx="72%"
          cy="28%"
          r="48%"
        >
          <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      {finale ? (
        <rect width="360" height="200" fill="transparent" />
      ) : (
        <rect width="360" height="200" fill={`url(#bp-deck-sky-${uid})`} />
      )}
      <rect
        width="360"
        height="200"
        fill={`url(#bp-deck-glow-${uid})`}
        opacity={active ? 1 : 0.45}
      />
      {/* Soft depth wash under the route — hierarchy without card soup */}
      <ellipse
        cx="180"
        cy="168"
        rx="140"
        ry="28"
        fill={finale ? "#0F172A" : accent}
        opacity={finale ? 0.35 : 0.06}
      />
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
          fill={finale ? "#F4F6FA" : "#0F172A"}
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
  focusLabel,
  sheetEyebrow,
  sheetSupport,
  softSupport,
  softBadge,
  softLiveBadge,
}: Omit<Props, "progressLabel" | "liveBadge">) {
  const online = useBrowserOnline();
  const softOpen = !online;
  const reduced = usePrefersReducedMotion();
  const [focus, setFocus] = useState(0);

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
          <h2 className="font-display text-[clamp(1.85rem,4.5vw,2.65rem)] font-bold tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base">
            {support}
          </p>
        </header>

        {/*
          How SoftFail depth (BEA-317 after #212):
          azure rail · Soft badge · softSupport · mist SoftFail band ·
          tip-011 mist-wash steps — never timber.
        */}
        <div className={reduced ? "mt-10" : "mt-10 animate-rise"}>
          <HowSoftFailSheet
            softOpen={softOpen}
            sheetEyebrow={sheetEyebrow}
            sheetSupport={sheetSupport}
            softSupport={softSupport}
            softBadge={softBadge}
            softLiveBadge={softLiveBadge}
            offlineNotice={offlineNotice}
            bodyLabel={focusLabel}
          >
            {/* Step focus rail — mist-track · azure select (#46 / tip-011) */}
            <div
              className={`animate-rise ${
                softOpen
                  ? "rounded-bp-sm shadow-[inset_3px_0_0_var(--bp-river)]"
                  : ""
              }`}
              style={reduced ? undefined : { animationDelay: "55ms" }}
            >
              <div
                className={`inline-flex max-w-full flex-wrap gap-0.5 rounded-bp-sm bg-mist/50 p-1 ${
                  softOpen ? "ml-0.5" : ""
                }`}
                role="group"
                aria-label={focusLabel}
              >
                {cards.map((step, index) => {
                  const on = focus === index;
                  return (
                    <button
                      key={step.title}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFocus(index)}
                      className={`rounded-bp-xs px-3.5 py-1.5 text-sm font-semibold transition duration-bp ease-bp-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                        on
                          ? "animate-stop-select bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
                          : "text-ink-soft hover:text-river"
                      }`}
                    >
                      {step.title}
                    </button>
                  );
                })}
              </div>
            </div>

            <ol className="mt-6 space-y-0 border-t border-ink/8">
              {cards.map((step, index) => {
                const on = focus === index;
                return (
                  <li
                    key={step.title}
                    className={`animate-rise border-b border-ink/8`}
                    style={
                      reduced
                        ? undefined
                        : { animationDelay: `${85 + index * 45}ms` }
                    }
                  >
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFocus(index)}
                      className={`group grid w-full gap-2 py-6 text-left transition duration-bp ease-bp-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 focus-visible:ring-inset md:grid-cols-[4.5rem_minmax(10rem,16rem)_1fr] md:items-baseline md:gap-8 md:py-7 ${
                        on
                          ? "animate-stop-select bg-mist/25 shadow-[inset_3px_0_0_var(--bp-river)]"
                          : "hover:bg-mist/30"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`pl-1 font-display text-lg font-bold tabular-nums tracking-[-0.03em] md:pl-2 md:text-xl ${
                          on
                            ? "text-river"
                            : "text-river/70 group-hover:text-river"
                        }`}
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
                      <p className="pr-1 text-sm leading-relaxed text-ink-soft md:pr-2 md:text-base">
                        {step.body}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ol>
          </HowSoftFailSheet>
        </div>
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
 * Landing how-it-works SoftFailNotice depth (BEA-317 after #212):
 * azure SoftFail sheet · Soft/Live badge · softSupport · compact SoftFailNotice
 * mist band under rail · tip-011 mist-wash SheetPresence step rail · tip-019
 * throw deck stays outside — SoftFail owned by the sheet (yield if a child
 * owned SoftFail; none today). Never timber / Failed to fetch.
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
  focusLabel,
  liveBadge,
  sheetEyebrow,
  sheetSupport,
  softSupport,
  softBadge,
  softLiveBadge,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const pin = usePinEnabled(reduced);
  const online = useBrowserOnline();
  const softOpen = !online;
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

  const scrollToStep = useCallback(
    (index: number) => {
      const section = sectionRef.current;
      if (!section || !pin) return;
      const vh = window.innerHeight;
      const scale = scrollScale(vh);
      const throwDist = deckThrowDistance(scale);
      const scrollY = window.scrollY || window.pageYOffset;
      const start = section.getBoundingClientRect().top + scrollY;
      const clamped = Math.min(cards.length - 1, Math.max(0, index));
      window.scrollTo({
        top: start + clamped * throwDist + 2,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [cards.length, pin, reduced],
  );

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
        focusLabel={focusLabel}
        sheetEyebrow={sheetEyebrow}
        sheetSupport={sheetSupport}
        softSupport={softSupport}
        softBadge={softBadge}
        softLiveBadge={softLiveBadge}
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
          className={`mx-auto mb-5 w-full max-w-xl text-center md:mb-6 ${revealClass}`}
          style={reveal(0)}
        >
          <span
            aria-hidden
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-river"
          />
          <h2 className="font-display text-[clamp(1.85rem,4.5vw,2.65rem)] font-bold tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft md:text-base">
            {support}
          </p>
        </header>

        {/*
          How SoftFail depth (BEA-317 after #212):
          azure rail · Soft badge · softSupport · mist SoftFail band ·
          tip-011 mist-wash step rail — tip-019 throw cards stay outside;
          never timber.
        */}
        <div
          className={`mb-4 w-full max-w-xl ${revealClass}`}
          style={reveal(50)}
        >
          <HowSoftFailSheet
            softOpen={softOpen}
            sheetEyebrow={sheetEyebrow}
            sheetSupport={sheetSupport}
            softSupport={softSupport}
            softBadge={softBadge}
            softLiveBadge={softLiveBadge}
            offlineNotice={offlineNotice}
            bodyLabel={focusLabel}
            dense
          >
            {/* Step focus rail — mist-track · jumps throw progress (tip-011) */}
            <div
              className={`animate-rise ${
                softOpen
                  ? "rounded-bp-sm shadow-[inset_3px_0_0_var(--bp-river)]"
                  : ""
              }`}
              style={reduced ? undefined : { animationDelay: "55ms" }}
            >
              <div
                className={`mx-auto flex max-w-full flex-wrap justify-center gap-0.5 rounded-bp-sm bg-mist/50 p-1 ${
                  softOpen ? "ml-0.5" : ""
                }`}
                role="group"
                aria-label={focusLabel}
              >
                {cards.map((card, i) => {
                  const on = activeIndex === i;
                  return (
                    <button
                      key={card.title}
                      type="button"
                      aria-pressed={on}
                      onClick={() => scrollToStep(i)}
                      className={`rounded-bp-xs px-3.5 py-1.5 text-sm font-semibold transition duration-bp ease-bp-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                        on
                          ? "animate-stop-select bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
                          : "text-ink-soft hover:text-river"
                      }`}
                    >
                      {card.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </HowSoftFailSheet>
        </div>

        <div
          className={`relative mx-auto w-full max-w-[27rem] ${revealClass}`}
          style={reveal(110)}
        >
          <div className="relative" style={{ height: cardMaxH }}>
            {cards.map((card, i) => {
              const tint = DECK_TINTS[i % DECK_TINTS.length] ?? DECK_TINTS[0];
              const z = cards.length - i;
              const isActive = activeIndex === i;
              const isFinale = i === cards.length - 1;
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
                      ? isFinale
                        ? "0 22px 48px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(96, 165, 250, 0.18)"
                        : "0 20px 44px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(47, 107, 255, 0.16)"
                      : "0 10px 28px rgba(15, 23, 42, 0.06)",
                  }}
                >
                  {/* Azure lead rail on the live card — hierarchy without card soup */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-3 left-0 z-10 w-[3px] rounded-full transition duration-bp ease-bp-out-strong"
                    style={{
                      backgroundColor: tint.accent,
                      opacity: isActive ? 0.95 : 0,
                      transform: isActive ? "scaleY(1)" : "scaleY(0.4)",
                    }}
                  />

                  {/* Sheet chrome header — step eyebrow + live badge */}
                  <header
                    className="relative flex items-center justify-between gap-2 border-b px-4 py-2 sm:px-5"
                    style={{
                      borderColor: isFinale
                        ? "rgba(244, 246, 250, 0.08)"
                        : "rgba(15, 23, 42, 0.06)",
                      backgroundColor: isFinale
                        ? "rgba(15, 23, 42, 0.55)"
                        : "rgba(255, 255, 255, 0.42)",
                    }}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: tint.accent, opacity: 0.95 }}
                    >
                      {stepEyebrow} · {String(i + 1).padStart(2, "0")}
                    </p>
                    <span
                      className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp ease-bp-out-strong ${
                        isActive
                          ? "animate-stop-select bg-river/12 text-river"
                          : isFinale
                            ? "bg-foam/10 text-foam/70"
                            : "bg-mist/60 text-ink-soft"
                      }`}
                      style={
                        isActive && isFinale
                          ? {
                              backgroundColor: "rgba(96,165,250,0.18)",
                              color: "#60A5FA",
                            }
                          : undefined
                      }
                    >
                      {isActive ? liveBadge : String(i + 1).padStart(2, "0")}
                    </span>
                  </header>

                  <div
                    className="mx-2 mt-2 overflow-hidden rounded-bp-lg transition duration-bp ease-bp-out-strong"
                    style={{
                      height: "40%",
                      background: isFinale
                        ? "linear-gradient(160deg, #1e293b, #0f172a)"
                        : "linear-gradient(160deg, rgba(255,255,255,0.7), rgba(47,107,255,0.12))",
                      boxShadow: isActive
                        ? isFinale
                          ? "inset 0 0 0 1px rgba(96, 165, 250, 0.22)"
                          : "inset 0 0 0 1px rgba(47, 107, 255, 0.18), 0 4px 16px rgba(47, 107, 255, 0.08)"
                        : "inset 0 0 0 1px rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    <DeckArt
                      index={i}
                      accent={tint.accent}
                      active={isActive && entered}
                    />
                  </div>
                  <div className="flex flex-col px-6 pb-6 pt-3">
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
        </div>

        {/* Tip 019 §2 — quiet progress: thin bar + selectable dots (tip-011) */}
        <div
          className={`mt-6 w-full max-w-[14rem] md:mt-7 ${revealClass}`}
          style={reveal(150)}
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
          <div className="mt-3 flex justify-center gap-1.5">
            {cards.map((card, i) => {
              const on = activeIndex === i;
              return (
                <button
                  key={card.title}
                  type="button"
                  aria-label={`${stepEyebrow} ${i + 1}`}
                  aria-pressed={on}
                  onClick={() => scrollToStep(i)}
                  className={`h-1.5 rounded-full transition-[background-color,width,transform] duration-bp ease-bp-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                    on ? "animate-stop-select" : ""
                  }`}
                  style={{
                    width: on ? "1.45rem" : "0.7rem",
                    backgroundColor: on
                      ? "var(--bp-river)"
                      : "rgba(15, 23, 42, 0.14)",
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className={`mt-7 md:mt-8 ${revealClass}`} style={reveal(190)}>
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
