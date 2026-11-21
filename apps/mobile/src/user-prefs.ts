import AsyncStorage from "@react-native-async-storage/async-storage";
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
  return (
    typeof value === "string" &&
    MAP_ENGINES.includes(value as Trip["mapEngine"])
  );
}

function isDistanceUnit(value: unknown): value is DistanceUnit {
  return (
    typeof value === "string" &&
    DISTANCE_UNITS.includes(value as DistanceUnit)
  );
}

function isShareTemplateId(value: unknown): value is ShareTemplateId {
  return typeof value === "string" && SHARE_IDS.has(value as ShareTemplateId);
}

function normalize(parsed: Partial<UserPrefs>): UserPrefs {
  return {
    mapEngine: isMapEngine(parsed.mapEngine)
      ? parsed.mapEngine
      : DEFAULT_USER_PREFS.mapEngine,
    locale:
      parsed.locale && isLocale(parsed.locale)
        ? parsed.locale
        : DEFAULT_USER_PREFS.locale,
    distanceUnit: isDistanceUnit(parsed.distanceUnit)
      ? parsed.distanceUnit
      : DEFAULT_USER_PREFS.distanceUnit,
    shareImageTemplateId: isShareTemplateId(parsed.shareImageTemplateId)
      ? parsed.shareImageTemplateId
      : DEFAULT_USER_PREFS.shareImageTemplateId,
  };
}

/** Read prefs from AsyncStorage (Expo). Soft-fails to defaults. */
export async function readUserPrefs(): Promise<UserPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_PREFS };
    return normalize(JSON.parse(raw) as Partial<UserPrefs>);
  } catch {
    return { ...DEFAULT_USER_PREFS };
  }
}

export async function writeUserPrefs(next: UserPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Soft-fail: private mode / quota — prefs stay in-memory for the session.
  }
}

export async function patchUserPrefs(
  patch: Partial<UserPrefs>,
): Promise<UserPrefs> {
  const next = { ...(await readUserPrefs()), ...patch };
  await writeUserPrefs(next);
  return next;
}
