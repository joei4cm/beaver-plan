"use client";

import type { ShareTemplateId, Trip } from "@beaver/core";
import { SHARE_TEMPLATES } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { isLocale } from "@beaver/i18n";

export type DistanceUnit = "km" | "mi";

export type UserPrefs = {
  mapEngine: Trip["mapEngine"];
  locale: Locale;
  distanceUnit: DistanceUnit;
  shareImageTemplateId: ShareTemplateId;
};

const STORAGE_KEY = "beaver-plan:user-prefs-v1";
const LOCALE_COOKIE = "bp_locale";

export const DEFAULT_USER_PREFS: UserPrefs = {
  mapEngine: "auto",
  locale: "zh-CN",
  distanceUnit: "km",
  shareImageTemplateId: "magazine-reel",
};

const MAP_ENGINES: Trip["mapEngine"][] = ["auto", "google", "amap", "baidu"];
const DISTANCE_UNITS: DistanceUnit[] = ["km", "mi"];
const SHARE_IDS = new Set(SHARE_TEMPLATES.map((t) => t.id));

function isMapEngine(value: unknown): value is Trip["mapEngine"] {
  return typeof value === "string" && MAP_ENGINES.includes(value as Trip["mapEngine"]);
}

function isDistanceUnit(value: unknown): value is DistanceUnit {
  return typeof value === "string" && DISTANCE_UNITS.includes(value as DistanceUnit);
}

function isShareTemplateId(value: unknown): value is ShareTemplateId {
  return typeof value === "string" && SHARE_IDS.has(value as ShareTemplateId);
}

export function readUserPrefs(): UserPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_USER_PREFS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    return {
      mapEngine: isMapEngine(parsed.mapEngine)
        ? parsed.mapEngine
        : DEFAULT_USER_PREFS.mapEngine,
      locale: parsed.locale && isLocale(parsed.locale)
        ? parsed.locale
        : DEFAULT_USER_PREFS.locale,
      distanceUnit: isDistanceUnit(parsed.distanceUnit)
        ? parsed.distanceUnit
        : DEFAULT_USER_PREFS.distanceUnit,
      shareImageTemplateId: isShareTemplateId(parsed.shareImageTemplateId)
        ? parsed.shareImageTemplateId
        : DEFAULT_USER_PREFS.shareImageTemplateId,
    };
  } catch {
    return { ...DEFAULT_USER_PREFS };
  }
}

export function writeUserPrefs(next: UserPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Soft-fail: private mode / quota — prefs stay in-memory for the session.
  }
}

/** Persist UI locale for the Next.js layout cookie reader. */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
}

export function patchUserPrefs(patch: Partial<UserPrefs>): UserPrefs {
  const next = { ...readUserPrefs(), ...patch };
  writeUserPrefs(next);
  if (patch.locale) writeLocaleCookie(patch.locale);
  return next;
}
