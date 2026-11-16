import { DEMO_PLACES } from "../map/demo-data.js";
import { haversineM } from "../map/polyline.js";
import type { PlaceSummary } from "../ports.js";
import type { DayFillInterest } from "./types.js";

/** Curated tags for demo POIs — drives scripted + LLM catalog. */
export const DEMO_PLACE_TAGS: Record<string, DayFillInterest[]> = {
  "demo-fushimi": ["temples", "photo", "culture"],
  "demo-kiyomizu": ["temples", "photo", "culture"],
  "demo-arashiyama": ["nature", "photo"],
  "demo-gion": ["culture", "photo", "food"],
  "demo-nishiki": ["food", "shopping"],
  "demo-thebund": ["photo", "culture"],
  "demo-yuyuan": ["culture", "shopping", "food"],
  "demo-westlake": ["nature", "photo"],
  "demo-forbidden": ["culture", "photo", "temples"],
  "demo-tsukiji": ["food", "shopping"],
};

export type TaggedPlace = PlaceSummary & {
  tags: DayFillInterest[];
  /** Rough destination bucket for scripting. */
  city: "kyoto" | "shanghai" | "hangzhou" | "beijing" | "tokyo" | "other";
};

const CITY_BY_ID: Record<string, TaggedPlace["city"]> = {
  "demo-fushimi": "kyoto",
  "demo-kiyomizu": "kyoto",
  "demo-arashiyama": "kyoto",
  "demo-gion": "kyoto",
  "demo-nishiki": "kyoto",
  "demo-thebund": "shanghai",
  "demo-yuyuan": "shanghai",
  "demo-westlake": "hangzhou",
  "demo-forbidden": "beijing",
  "demo-tsukiji": "tokyo",
};

export function taggedDemoCatalog(): TaggedPlace[] {
  return DEMO_PLACES.map((p) => ({
    ...p,
    tags: DEMO_PLACE_TAGS[p.enginePlaceId] ?? ["culture"],
    city: CITY_BY_ID[p.enginePlaceId] ?? "other",
  }));
}

export function inferCityHint(
  destination?: string,
  timezone?: string,
): TaggedPlace["city"] {
  const d = (destination ?? "").toLowerCase();
  const tz = (timezone ?? "").toLowerCase();
  if (d.includes("kyoto") || d.includes("京都")) return "kyoto";
  if (d.includes("shanghai") || d.includes("上海")) return "shanghai";
  if (d.includes("hangzhou") || d.includes("杭州")) return "hangzhou";
  if (d.includes("beijing") || d.includes("北京")) return "beijing";
  if (d.includes("tokyo") || d.includes("东京") || d.includes("東京")) return "tokyo";
  if (tz.includes("shanghai")) return "shanghai";
  // Asia/Tokyo + empty/unknown destination → Kyoto demo catalog
  if (tz.includes("tokyo")) return "kyoto";
  return "kyoto";
}

export function filterCatalogByCity(
  catalog: TaggedPlace[],
  city: TaggedPlace["city"],
): TaggedPlace[] {
  const hit = catalog.filter((p) => p.city === city);
  return hit.length > 0 ? hit : catalog.filter((p) => p.city === "kyoto");
}

export function scorePlaceForInterests(
  tags: DayFillInterest[],
  interests: DayFillInterest[],
): number {
  if (interests.length === 0) return 1;
  let score = 0;
  for (const i of interests) {
    if (tags.includes(i)) score += 1;
  }
  return score;
}

/** Soft stop count from walk budget. */
export function stopsPerDayForWalkBudget(maxWalkMinutes: number): number {
  if (maxWalkMinutes <= 30) return 2;
  if (maxWalkMinutes <= 60) return 3;
  if (maxWalkMinutes <= 90) return 3;
  return 4;
}

/** ~80 m/min casual sightseeing walk. */
export function estimateWalkMinutes(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return Math.max(5, Math.round(haversineM(a, b) / 80));
}

export function normalizeInterests(
  raw: string[] | undefined,
): DayFillInterest[] {
  if (!raw?.length) return ["temples", "food", "culture"];
  const allowed = new Set<string>([
    "temples",
    "food",
    "nature",
    "shopping",
    "culture",
    "photo",
  ]);
  const out: DayFillInterest[] = [];
  for (const r of raw) {
    const v = r.trim().toLowerCase();
    if (allowed.has(v) && !out.includes(v as DayFillInterest)) {
      out.push(v as DayFillInterest);
    }
  }
  return out.length > 0 ? out : ["temples", "food", "culture"];
}
