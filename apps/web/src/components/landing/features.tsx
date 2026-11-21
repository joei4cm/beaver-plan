"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { usePrefersReducedMotion } from "./scroll-motion";

export type FeatureItem = {
  title: string;
  body: string;
};

type Props = {
  title: string;
  support: string;
  items: FeatureItem[];
  offlineNotice: string;
  focusLabel: string;
  leadEyebrow: string;
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

/**
 * Azure route plane for the lead feature — wash + path, not a bordered card.
 * Draw/markers only fire when the section is in view (tip-011 settle).
 */
function LeadRouteArt({ active }: { active: boolean }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      aria-hidden
      className="h-full w-full"
      viewBox="0 0 520 320"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`bp-feat-sky-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DBE8FF" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#EEF3FB" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#F4F6FA" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect width="520" height="320" fill={`url(#bp-feat-sky-${uid})`} />
      <path
        d="M36 248 C 110 190, 150 220, 210 160 S 320 70, 390 96 S 460 150, 500 120"
        fill="none"
        stroke="#2F6BFF"
        strokeWidth="10"
        strokeLinecap="round"
        opacity="0.1"
      />
      <path
        className={active ? "animate-route-draw" : undefined}
        d="M36 248 C 110 190, 150 220, 210 160 S 320 70, 390 96 S 460 150, 500 120"
        fill="none"
        stroke="#2F6BFF"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeDasharray="1"
        strokeDashoffset={active ? "1" : "0"}
        pathLength={1}
        opacity={active ? undefined : 0.85}
      />
      <g
        className={active ? "animate-marker-pop" : undefined}
        style={active ? { animationDelay: "420ms" } : undefined}
      >
        <circle cx="210" cy="160" r="9" fill="#FFFFFF" />
        <circle cx="210" cy="160" r="5.5" fill="#2F6BFF" />
      </g>
      <g
        className={active ? "animate-marker-pop" : undefined}
        style={active ? { animationDelay: "560ms" } : undefined}
      >
        <circle cx="390" cy="96" r="9" fill="#FFFFFF" />
        <circle cx="390" cy="96" r="5.5" fill="#2F6BFF" />
      </g>
      <g
        className={active ? "animate-marker-pop" : undefined}
        style={active ? { animationDelay: "700ms" } : undefined}
      >
        <circle cx="500" cy="120" r="11" fill="#FFFFFF" />
        <circle cx="500" cy="120" r="6.5" fill="#0F172A" />
      </g>
    </svg>
  );
}

/**
 * Mid-page features — Lumen Route depth craft (BEA-203).
 * Lead map plane + mist-track focus · azure inset rows · SoftFail offline · tip-011.
 * No card soup.
 */
export function LandingFeatures({
  title,
  support,
  items,
  offlineNotice,
  focusLabel,
  leadEyebrow,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const { ref, visible } = useSectionReveal(reduced);
  const online = useBrowserOnline();
  const [focus, setFocus] = useState(0);

  const lead = items[focus] ?? items[0];
  if (!lead) return null;

  const focusKey = `${focus}-${lead.title}`;

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
            <h2 className="font-display text-[clamp(1.85rem,4.5vw,2.65rem)] font-bold tracking-[-0.03em] text-ink">
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

        <div
          className={`mt-8 ${revealClass(visible, reduced)}`}
          style={reduced ? undefined : { animationDelay: "100ms" }}
        >
          <SoftFailNotice open={!online}>{offlineNotice}</SoftFailNotice>
        </div>

        {/* Pillar focus rail — mist-track · azure select (#46 / tip-011) */}
        <div
          className={`mt-10 ${revealClass(visible, reduced)}`}
          style={reduced ? undefined : { animationDelay: "130ms" }}
        >
          <div
            className="inline-flex max-w-full flex-wrap gap-0.5 rounded-bp-sm bg-mist/50 p-1"
            role="group"
            aria-label={focusLabel}
          >
            {items.map((item, index) => {
              const on = focus === index;
              return (
                <button
                  key={item.title}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFocus(index)}
                  className={`rounded-bp-xs px-3.5 py-1.5 text-sm font-semibold transition duration-bp ease-bp-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                    on
                      ? "animate-stop-select bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
                      : "text-ink-soft hover:text-river"
                  }`}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lead feature — one composition, azure route plane */}
        <div
          key={focusKey}
          className={`mt-12 grid items-center gap-10 md:mt-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-14 ${revealClass(visible, reduced)}`}
          style={reduced ? undefined : { animationDelay: "160ms" }}
        >
          <div
            className={`relative pl-4 shadow-[inset_3px_0_0_var(--bp-river)] transition duration-bp ease-bp-out-strong md:pl-5 ${
              reduced ? "" : "animate-rise"
            }`}
            style={reduced ? undefined : { animationDelay: "40ms" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-river">
              {leadEyebrow} · {String(focus + 1).padStart(2, "0")}
            </p>
            <p
              aria-hidden
              className="mt-3 font-display text-4xl font-extrabold leading-none tracking-[-0.05em] text-river/30 md:text-5xl"
            >
              {String(focus + 1).padStart(2, "0")}
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
            className={`relative aspect-[13/8] overflow-hidden rounded-bp-lg bg-mist/60 ring-1 ring-river/15 shadow-bp-soft md:aspect-auto md:min-h-[16rem] ${
              reduced ? "" : "animate-rise"
            }`}
            style={reduced ? undefined : { animationDelay: "90ms" }}
          >
            <LeadRouteArt active={visible && !reduced} />
          </div>
        </div>

        {/* Secondary pillars — editorial rows with azure focus rail */}
        {items.length > 1 ? (
          <ul className="mt-16 border-t border-ink/8 md:mt-20">
            {items.map((item, index) => {
              const n = index + 1;
              const delay = 200 + index * 55;
              const on = focus === index;
              return (
                <li
                  key={item.title}
                  className={`border-b border-ink/8 ${revealClass(visible, reduced)}`}
                  style={
                    reduced ? undefined : { animationDelay: `${delay}ms` }
                  }
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFocus(index)}
                    className={`group grid w-full gap-2 py-7 text-left transition duration-bp ease-bp-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 focus-visible:ring-inset md:grid-cols-[4.5rem_minmax(10rem,15rem)_1fr] md:items-baseline md:gap-8 md:py-8 ${
                      on
                        ? "animate-stop-select bg-mist/25 shadow-[inset_3px_0_0_var(--bp-river)]"
                        : "hover:bg-mist/30"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`pl-1 font-display text-lg font-bold tabular-nums tracking-[-0.03em] md:pl-2 md:text-xl ${
                        on ? "text-river" : "text-river/70 group-hover:text-river"
                      }`}
                    >
                      {String(n).padStart(2, "0")}
                    </span>
                    <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink md:text-xl">
                      {item.title}
                    </span>
                    <span className="pr-1 text-sm leading-relaxed text-ink-soft md:pr-2 md:text-base">
                      {item.body}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
