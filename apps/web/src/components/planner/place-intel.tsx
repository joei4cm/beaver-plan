"use client";

import { useRef } from "react";
import {
  DAY_FILL_INTERESTS,
  type DayFillInterest,
  type PlaceDetails,
} from "@beaver/core";
import type { Locale, MessageKey } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
import { PlaceIntelSkeleton } from "@/components/ui/skeleton";

type Props = {
  details: PlaceDetails | null;
  loading?: boolean;
  locale: Locale;
  /** Demo / soft-fail badge when live Places is unavailable. */
  demoMode?: boolean;
  userNote?: string;
};

const INTEREST_KEYS: Record<DayFillInterest, MessageKey> = {
  temples: "planner.dayFill.interest.temples",
  food: "planner.dayFill.interest.food",
  nature: "planner.dayFill.interest.nature",
  shopping: "planner.dayFill.interest.shopping",
  culture: "planner.dayFill.interest.culture",
  photo: "planner.dayFill.interest.photo",
};

function interestLabel(locale: Locale, tag: string): string {
  if ((DAY_FILL_INTERESTS as readonly string[]).includes(tag)) {
    return t(locale, INTEREST_KEYS[tag as DayFillInterest]);
  }
  return tag;
}

function hasPlaceMeta(details: PlaceDetails, userNote?: string): boolean {
  return (
    details.rating != null ||
    Boolean(details.openingHours?.[0]) ||
    (details.tags?.length ?? 0) > 0 ||
    Boolean(details.summary) ||
    Boolean(userNote)
  );
}

/** Azure section eyebrow — matches booking / map-chrome depth chrome. */
function SectionEyebrow({ children }: { children: string }) {
  return (
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
      {children}
    </p>
  );
}

/**
 * Map place pin sheet — deeper Lumen hierarchy after #85/#118:
 * pin identity header · Snapshot · Categories · About · Note,
 * absolute river rail, SoftFailNotice footer, SheetPresence + #46 rise.
 */
export function PlaceIntel({
  details,
  loading,
  locale,
  demoMode,
  userNote,
}: Props) {
  const snapRef = useRef<{
    details: PlaceDetails;
    userNote?: string;
    demoMode?: boolean;
  } | null>(null);

  if (loading && !details) {
    return (
      <div
        className="animate-fade"
        aria-label={t(locale, "planner.place.loading")}
      >
        <PlaceIntelSkeleton />
      </div>
    );
  }

  const open = Boolean(details && hasPlaceMeta(details, userNote));
  if (details && hasPlaceMeta(details, userNote)) {
    snapRef.current = { details, userNote, demoMode };
  }
  const snap = snapRef.current;
  const view = snap?.details;
  const note = snap?.userNote;
  const demo = snap?.demoMode;
  const hours = view?.openingHours?.[0];
  const extraHours = view?.openingHours?.slice(1, 3) ?? [];
  const tags = view?.tags?.slice(0, 4) ?? [];
  const showSnapshot = view != null && (view.rating != null || Boolean(hours));
  const showTags = tags.length > 0;
  const showAbout = Boolean(view?.summary);
  const showNote = Boolean(note);

  return (
    <SheetPresence
      open={open}
      className="mt-3 overflow-hidden rounded-bp-sm border border-river/25 bg-foam shadow-bp"
      style={{ animationDelay: "40ms" }}
      aria-label={t(locale, "planner.place.pinEyebrow")}
    >
      {view ? (
        <>
          {/* Pin identity — elevated over section stack */}
          <header className="relative border-b border-[color:var(--bp-line)] bg-paper/80 px-3 py-2.5 pl-3.5">
            <span
              className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-river"
              aria-hidden
            />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                    {t(locale, "planner.place.pinEyebrow")}
                  </span>
                  <span
                    className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] bp-transition ${
                      demo
                        ? "bg-mist text-ink-soft"
                        : "bg-river/12 text-river-deep"
                    }`}
                  >
                    {demo
                      ? t(locale, "planner.place.demoBadge")
                      : t(locale, "planner.place.liveBadge")}
                  </span>
                </div>
                <p className="font-display text-sm font-semibold tracking-tight text-ink">
                  {view.name}
                </p>
                {view.address ? (
                  <p className="truncate text-[11px] leading-snug text-ink-soft">
                    {view.address}
                  </p>
                ) : (
                  <p className="text-[11px] leading-snug text-ink-soft/80">
                    {t(locale, "planner.place.pinSupport")}
                  </p>
                )}
              </div>
              <PinGlyph className="mt-0.5 shrink-0 text-river" />
            </div>
          </header>

          <div className="divide-y divide-[color:var(--bp-line)]">
            {showSnapshot ? (
              <section
                className="animate-rise space-y-2 bg-mist/20 px-3 py-3"
                style={{ animationDelay: "55ms" }}
                aria-label={t(locale, "planner.place.snapshotEyebrow")}
              >
                <SectionEyebrow>
                  {t(locale, "planner.place.snapshotEyebrow")}
                </SectionEyebrow>
                <div className="flex flex-wrap items-center gap-2">
                  {view.rating != null && (
                    <span className="inline-flex items-baseline gap-1 rounded-bp-xs bg-river/10 px-2 py-1 font-display text-sm font-bold tracking-tight text-river shadow-[inset_2px_0_0_var(--bp-river)]">
                      <span
                        aria-hidden
                        className="text-[0.7rem] font-bold tracking-wide text-river/80"
                      >
                        ★
                      </span>
                      <span>{view.rating.toFixed(1)}</span>
                      <span className="sr-only">
                        {t(locale, "planner.place.rating")}
                      </span>
                    </span>
                  )}
                  {hours && (
                    <span className="rounded-bp-xs border border-river/15 bg-foam/90 px-2 py-1 text-xs leading-relaxed text-ink-soft">
                      <span className="font-medium text-ink-soft/85">
                        {t(locale, "planner.place.hours")}
                      </span>{" "}
                      <span className="text-ink/85">{hours}</span>
                    </span>
                  )}
                </div>
                {extraHours.length > 0 && (
                  <ul className="space-y-0.5 text-xs leading-relaxed text-ink-soft">
                    {extraHours.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {showTags ? (
              <section
                className="animate-rise space-y-2 px-3 py-3"
                style={{ animationDelay: "75ms" }}
                aria-label={t(locale, "planner.place.tags")}
              >
                <SectionEyebrow>
                  {t(locale, "planner.place.tags")}
                </SectionEyebrow>
                <ul className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-bp-xs border border-river/20 bg-river/10 px-2 py-0.5 text-[11px] font-medium text-river-deep bp-transition"
                    >
                      {interestLabel(locale, tag)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {showAbout ? (
              <section
                className="animate-rise space-y-2 px-3 py-3"
                style={{ animationDelay: "95ms" }}
                aria-label={t(locale, "planner.place.aboutEyebrow")}
              >
                <SectionEyebrow>
                  {t(locale, "planner.place.aboutEyebrow")}
                </SectionEyebrow>
                <p className="text-sm leading-relaxed text-ink/90">
                  {view.summary}
                </p>
              </section>
            ) : null}

            {showNote ? (
              <section
                className="animate-rise relative space-y-1.5 bg-paper/50 px-3 py-3 pl-3.5"
                style={{ animationDelay: "115ms" }}
                aria-label={t(locale, "planner.place.note")}
              >
                <span
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-river/70"
                  aria-hidden
                />
                <SectionEyebrow>
                  {t(locale, "planner.place.note")}
                </SectionEyebrow>
                <p className="text-xs leading-relaxed text-ink-soft">{note}</p>
              </section>
            ) : null}
          </div>

          {/* SoftFailNotice owned by pin sheet footer — never doubles stage chrome */}
          <SoftFailNotice open={demo} compact>
            {t(locale, "planner.place.softFail")}
          </SoftFailNotice>
        </>
      ) : null}
    </SheetPresence>
  );
}

function PinGlyph({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M8 1.5c-2.4 0-4.35 1.9-4.35 4.25 0 3.05 4.35 8.25 4.35 8.25s4.35-5.2 4.35-8.25C12.35 3.4 10.4 1.5 8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="5.75" r="1.45" fill="currentColor" />
    </svg>
  );
}
