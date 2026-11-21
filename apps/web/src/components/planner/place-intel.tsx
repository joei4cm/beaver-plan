"use client";

import {
  DAY_FILL_INTERESTS,
  type DayFillInterest,
  type PlaceDetails,
} from "@beaver/core";
import type { Locale, MessageKey } from "@beaver/i18n";
import { t } from "@beaver/i18n";

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

/**
 * Selected-stop place intel — Lumen Route hierarchy inside the itinerary
 * sheet (rating / hours / tags / blurb). Soft chrome only; not a card grid.
 */
export function PlaceIntel({
  details,
  loading,
  locale,
  demoMode,
  userNote,
}: Props) {
  if (loading && !details) {
    return (
      <div
        className="animate-fade mt-3 space-y-2 rounded-bp border border-[color:var(--bp-line)] bg-foam/90 px-3 py-2.5 shadow-bp-soft"
        aria-busy="true"
        aria-label={t(locale, "planner.place.loading")}
      >
        <div className="bp-skeleton h-3.5 w-24" />
        <div className="bp-skeleton h-3 w-40 max-w-full" />
        <div className="flex gap-1.5 pt-0.5">
          <div className="bp-skeleton h-5 w-14 rounded-bp-xs" />
          <div className="bp-skeleton h-5 w-16 rounded-bp-xs" />
        </div>
      </div>
    );
  }

  if (!details) return null;

  const hours = details.openingHours?.[0];
  const tags = details.tags?.slice(0, 4) ?? [];
  const hasMeta =
    details.rating != null ||
    Boolean(hours) ||
    tags.length > 0 ||
    Boolean(details.summary) ||
    Boolean(userNote);

  if (!hasMeta) return null;

  return (
    <div
      className="animate-sheet-in mt-3 rounded-bp border border-[color:var(--bp-line)] bg-foam/95 px-3 py-3 shadow-bp-soft backdrop-blur-sm"
      style={{ animationDelay: "40ms" }}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {details.rating != null && (
          <span className="inline-flex items-baseline gap-1 text-sm font-semibold text-river">
            <span aria-hidden className="text-[0.7rem] font-bold tracking-wide">
              ★
            </span>
            <span>{details.rating.toFixed(1)}</span>
            <span className="sr-only">{t(locale, "planner.place.rating")}</span>
          </span>
        )}
        {hours && (
          <span className="text-xs text-ink-soft">
            <span className="font-medium text-ink-soft/80">
              {t(locale, "planner.place.hours")}
            </span>{" "}
            {hours}
          </span>
        )}
        {demoMode && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-river/70">
            {t(locale, "planner.place.demoBadge")}
          </span>
        )}
      </div>

      {tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t(locale, "planner.place.tags")}>
          {tags.map((tag) => (
            <li
              key={tag}
              className="bg-mist/80 px-2 py-0.5 text-[11px] font-medium text-river-deep"
            >
              {interestLabel(locale, tag)}
            </li>
          ))}
        </ul>
      )}

      {details.summary && (
        <p className="mt-2 text-sm leading-relaxed text-ink/90">
          {details.summary}
        </p>
      )}

      {userNote && (
        <p className="mt-2 border-t border-[color:var(--bp-line)] pt-2 text-xs leading-relaxed text-ink-soft">
          <span className="font-medium text-ink-soft/90">
            {t(locale, "planner.place.note")}
          </span>{" "}
          {userNote}
        </p>
      )}
    </div>
  );
}
