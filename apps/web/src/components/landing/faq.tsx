"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
import { usePrefersReducedMotion } from "./scroll-motion";

export type FaqTopic = "all" | "plan" | "maps" | "road";

export type FaqItem = {
  id: string;
  topic: Exclude<FaqTopic, "all">;
  question: string;
  answer: string;
};

export type FaqTopicOption = {
  id: FaqTopic;
  label: string;
};

type Props = {
  title: string;
  support: string;
  topics: FaqTopicOption[];
  items: FaqItem[];
  offlineNotice: string;
  filterLabel: string;
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
 * Landing FAQ accordion — Lumen Route craft.
 * Hierarchy · mist-track / azure select · SoftFail if offline · tip-011 motion.
 * SheetPresence on answer panels; no card soup.
 */
export function LandingFaq({
  title,
  support,
  topics,
  items,
  offlineNotice,
  filterLabel,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const { ref, visible } = useSectionReveal(reduced);
  const online = useBrowserOnline();
  const baseId = useId();

  const [topic, setTopic] = useState<FaqTopic>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered =
    topic === "all" ? items : items.filter((item) => item.topic === topic);

  useEffect(() => {
    if (openId && !filtered.some((item) => item.id === openId)) {
      setOpenId(null);
    }
  }, [filtered, openId]);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden border-t border-ink/8 bg-paper"
      aria-label={title}
    >
      {/* Quiet azure wash — atmosphere only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[20rem]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 55% 45% at 8% 0%, rgba(47, 107, 255, 0.1), transparent 58%),
            radial-gradient(ellipse 40% 35% at 96% 28%, rgba(96, 165, 250, 0.07), transparent 55%)
          `,
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
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

        <div
          className={`mt-8 ${revealClass(visible, reduced)}`}
          style={reduced ? undefined : { animationDelay: "100ms" }}
        >
          <SoftFailNotice open={!online}>{offlineNotice}</SoftFailNotice>
        </div>

        {/* Topic rail — mist-track · azure select (#46 / tip-011) */}
        <div
          className={`mt-10 ${revealClass(visible, reduced)}`}
          style={reduced ? undefined : { animationDelay: "140ms" }}
        >
          <div
            className="inline-flex max-w-full flex-wrap gap-0.5 rounded-bp-sm bg-mist/50 p-1"
            role="group"
            aria-label={filterLabel}
          >
            {topics.map((opt) => {
              const on = topic === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTopic(opt.id)}
                  className={`rounded-bp-xs px-3.5 py-1.5 text-sm font-semibold transition duration-bp ease-bp-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 ${
                    on
                      ? "animate-stop-select bg-foam text-river shadow-bp-soft ring-1 ring-river/25"
                      : "text-ink-soft hover:text-river"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Accordion — hairline rows; azure rail when open */}
        <ul className="mt-10 border-t border-ink/8 md:mt-12">
          {filtered.map((item, index) => {
            const open = openId === item.id;
            const panelId = `${baseId}-panel-${item.id}`;
            const triggerId = `${baseId}-trigger-${item.id}`;
            const delay = 180 + index * 55;

            return (
              <li
                key={item.id}
                className={`border-b border-ink/8 ${revealClass(visible, reduced)}`}
                style={
                  reduced ? undefined : { animationDelay: `${delay}ms` }
                }
              >
                <button
                  type="button"
                  id={triggerId}
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenId(open ? null : item.id)}
                  className={`group relative flex w-full items-start justify-between gap-4 py-5 text-left transition duration-bp ease-bp-out-strong hover:bg-mist/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 focus-visible:ring-inset md:py-6 ${
                    open
                      ? "bg-mist/25 shadow-[inset_3px_0_0_var(--bp-river)]"
                      : ""
                  }`}
                >
                  <span className="min-w-0 pl-1 md:pl-2">
                    <span className="font-display text-base font-semibold tracking-[-0.02em] text-ink md:text-lg">
                      {item.question}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`mt-0.5 shrink-0 pr-1 text-river transition duration-bp ease-bp-out-strong md:pr-2 ${
                      open ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </button>

                <SheetPresence
                  open={open}
                  id={panelId}
                  role="region"
                  aria-label={item.question}
                  className="overflow-hidden"
                  style={{ animationDelay: "30ms" }}
                >
                  <p
                    className="max-w-2xl pb-6 pl-1 pr-8 text-sm leading-relaxed text-ink-soft md:pl-2 md:pr-12 md:text-base"
                    id={`${panelId}-copy`}
                  >
                    {item.answer}
                  </p>
                </SheetPresence>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
