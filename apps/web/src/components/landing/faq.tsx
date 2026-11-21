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
  sheetEyebrow: string;
  sheetSupport: string;
  offlineBadge: string;
  liveBadge: string;
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
 * FAQ SoftFail sheet — azure rail · Offline/Live · compact SoftFailNotice
 * under rail (`border-b`) · SheetPresence body (mist-track topics · accordion).
 * Depth craft after #191 (BEA-293): SoftFail strip owns a clear mist band
 * between azure rail and topics — never timber / Failed to fetch.
 */
function FaqSoftFailSheet({
  softOpen,
  sheetEyebrow,
  sheetSupport,
  offlineBadge,
  liveBadge,
  offlineNotice,
  bodyLabel,
  className,
  style,
  children,
}: {
  softOpen: boolean;
  sheetEyebrow: string;
  sheetSupport: string;
  offlineBadge: string;
  liveBadge: string;
  offlineNotice: string;
  bodyLabel: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft ${className ?? ""}`}
      style={style}
      aria-label={sheetEyebrow}
    >
      <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)] sm:px-5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
            {sheetEyebrow}
          </span>
          <span className="text-[11px] leading-snug text-ink-soft/80">
            {sheetSupport}
          </span>
        </div>
        <span
          className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
            softOpen ? "bg-mist text-ink-soft" : "bg-river/12 text-river"
          }`}
        >
          {softOpen ? offlineBadge : liveBadge}
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
        className="px-4 py-5 sm:px-5 sm:py-6"
        style={{ animationDelay: "40ms" }}
        aria-label={bodyLabel}
      >
        {children}
      </SheetPresence>
    </div>
  );
}

/**
 * Landing FAQ SoftFailNotice depth (BEA-293 after #143/#191):
 * FaqSoftFailSheet · azure FAQ rail · Offline/Live badge · compact SoftFailNotice
 * mist band under rail · mist-track topic chips · tip-011 rise stagger —
 * SoftFail owned by the sheet (no floating notice). Never timber / Failed to fetch.
 */
export function LandingFaq({
  title,
  support,
  topics,
  items,
  offlineNotice,
  filterLabel,
  sheetEyebrow,
  sheetSupport,
  offlineBadge,
  liveBadge,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const { ref, visible } = useSectionReveal(reduced);
  const online = useBrowserOnline();
  const softOpen = !online;
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

        {/*
          FAQ SoftFail depth (BEA-293 after #143/#191):
          FaqSoftFailSheet · azure FAQ rail · Offline/Live · mist SoftFail band ·
          mist-track topics · tip-011 accordion — never timber.
        */}
        <FaqSoftFailSheet
          softOpen={softOpen}
          sheetEyebrow={sheetEyebrow}
          sheetSupport={sheetSupport}
          offlineBadge={offlineBadge}
          liveBadge={liveBadge}
          offlineNotice={offlineNotice}
          bodyLabel={filterLabel}
          className={`mt-10 ${revealClass(visible, reduced)}`}
          style={reduced ? undefined : { animationDelay: "100ms" }}
        >
          {/* Topic rail — mist-track · azure select (#46 / tip-011) */}
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
          <ul className="mt-6 border-t border-ink/8">
            {filtered.map((item, index) => {
              const open = openId === item.id;
              const panelId = `${baseId}-panel-${item.id}`;
              const triggerId = `${baseId}-trigger-${item.id}`;
              const delay = 85 + index * 45;

              return (
                <li
                  key={item.id}
                  className={`animate-rise border-b border-ink/8`}
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
                    className={`group relative flex w-full items-start justify-between gap-4 py-4 text-left transition duration-bp ease-bp-out-strong hover:bg-mist/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 focus-visible:ring-inset md:py-5 ${
                      open
                        ? "bg-mist/25 shadow-[inset_3px_0_0_var(--bp-river)]"
                        : ""
                    }`}
                  >
                    <span className="min-w-0 pl-0.5 md:pl-1">
                      <span className="font-display text-base font-semibold tracking-[-0.02em] text-ink md:text-lg">
                        {item.question}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={`mt-0.5 shrink-0 pr-0.5 text-river transition duration-bp ease-bp-out-strong md:pr-1 ${
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
                      className="max-w-2xl pb-5 pl-0.5 pr-6 text-sm leading-relaxed text-ink-soft md:pl-1 md:pr-10 md:text-base"
                      id={`${panelId}-copy`}
                    >
                      {item.answer}
                    </p>
                  </SheetPresence>
                </li>
              );
            })}
          </ul>
        </FaqSoftFailSheet>
      </div>
    </section>
  );
}
