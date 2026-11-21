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

/**
 * Selected-stop place intel — Lumen Route sheet hierarchy inside the
 * itinerary list (eyebrow · rating/hours · tags · blurb · note).
 * Soft-fails to demo fixtures when Places keys / API are absent.
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

  return (
    <SheetPresence
      open={open}
      className="mt-3 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
      style={{ animationDelay: "40ms" }}
      aria-label={t(locale, "planner.place.eyebrow")}
    >
      {view ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
              {t(locale, "planner.place.eyebrow")}
            </span>
            <span
              className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
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

          <div className="space-y-2.5 px-3 py-3">
            {(view.rating != null || hours) && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {view.rating != null && (
                  <span className="inline-flex items-baseline gap-1 font-display text-base font-bold tracking-tight text-river">
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
                  <span className="text-xs leading-relaxed text-ink-soft">
                    <span className="font-medium text-ink-soft/85">
                      {t(locale, "planner.place.hours")}
                    </span>{" "}
                    <span className="text-ink/85">{hours}</span>
                  </span>
                )}
              </div>
            )}

            {extraHours.length > 0 && (
              <ul className="space-y-0.5 text-xs leading-relaxed text-ink-soft">
                {extraHours.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}

            {tags.length > 0 && (
              <ul
                className="flex flex-wrap gap-1.5"
                aria-label={t(locale, "planner.place.tags")}
              >
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-bp-xs bg-mist/90 px-2 py-0.5 text-[11px] font-medium text-river-deep transition duration-bp-fast ease-bp-out"
                  >
                    {interestLabel(locale, tag)}
                  </li>
                ))}
              </ul>
            )}

            {view.summary && (
              <p className="text-sm leading-relaxed text-ink/90">
                {view.summary}
              </p>
            )}

            {note && (
              <p className="border-t border-[color:var(--bp-line)] pt-2 text-xs leading-relaxed text-ink-soft">
                <span className="font-semibold uppercase tracking-[0.12em] text-ink-soft/90">
                  {t(locale, "planner.place.note")}
                </span>{" "}
                {note}
              </p>
            )}
          </div>

          <SoftFailNotice open={demo} compact>
            {t(locale, "planner.place.softFail")}
          </SoftFailNotice>
        </>
      ) : null}
    </SheetPresence>
  );
}
