import { addDaysIso, todayIsoDate } from "../templates.js";
import type { PlaceSummary } from "../ports.js";
import type { Stop } from "../domain.js";
import {
  estimateWalkMinutes,
  filterCatalogByCity,
  inferCityHint,
  scorePlaceForInterests,
  stopsPerDayForWalkBudget,
  taggedDemoCatalog,
  type TaggedPlace,
} from "./catalog.js";
import type {
  DayFillContext,
  DayFillProposedDay,
  DayFillProposedStop,
  DayFillProvider,
} from "./types.js";

function placeFromStop(stop: Stop): PlaceSummary {
  return {
    enginePlaceId: stop.place.enginePlaceId,
    name: stop.place.name,
    address: stop.place.address,
    lat: stop.place.lat,
    lng: stop.place.lng,
  };
}

function mergeCatalog(ctx: DayFillContext): TaggedPlace[] {
  const base = taggedDemoCatalog();
  const byId = new Map(base.map((p) => [p.enginePlaceId, p]));
  for (const p of ctx.catalog) {
    if (!byId.has(p.enginePlaceId)) {
      byId.set(p.enginePlaceId, {
        ...p,
        tags: ["culture"],
        city: "other",
      });
    }
  }
  for (const s of ctx.stops) {
    const id = s.place.enginePlaceId;
    if (!byId.has(id)) {
      byId.set(id, {
        ...placeFromStop(s),
        tags: ["culture"],
        city: "other",
      });
    }
  }
  return [...byId.values()];
}

/**
 * Greedy pack: prefer interest matches, cluster by proximity,
 * keep cumulative walk under maxWalkMinutesPerDay.
 */
function packDay(
  pool: TaggedPlace[],
  usedIds: Set<string>,
  existingByPlace: Map<string, Stop>,
  interests: DayFillContext["prefs"]["interests"],
  maxWalk: number,
  perDay: number,
): DayFillProposedStop[] {
  const available = pool
    .filter((p) => !usedIds.has(p.enginePlaceId))
    .map((p) => ({
      place: p,
      score: scorePlaceForInterests(p.tags, interests),
    }))
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));

  if (available.length === 0) return [];

  const picked: DayFillProposedStop[] = [];
  let walkUsed = 0;
  let cursor: { lat: number; lng: number } | null = null;

  // Prefer a high-scoring seed.
  const seed = available[0]!;
  const push = (p: TaggedPlace, walk?: number) => {
    usedIds.add(p.enginePlaceId);
    const existing = existingByPlace.get(p.enginePlaceId);
    picked.push({
      existingStopId: existing?.id,
      place: {
        enginePlaceId: p.enginePlaceId,
        name: p.name,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
      },
      userNote: existing?.userNote,
      estimatedWalkMinutes: walk,
    });
    cursor = { lat: p.lat, lng: p.lng };
  };

  push(seed.place, 0);

  while (picked.length < perDay) {
    let best: { place: TaggedPlace; walk: number; score: number } | null = null;
    for (const cand of available) {
      if (usedIds.has(cand.place.enginePlaceId)) continue;
      const walk = cursor
        ? estimateWalkMinutes(cursor, cand.place)
        : 0;
      if (walkUsed + walk > maxWalk && picked.length >= 2) continue;
      const score = cand.score * 10 - walk;
      if (!best || score > best.score) {
        best = { place: cand.place, walk, score };
      }
    }
    if (!best) break;
    walkUsed += best.walk;
    push(best.place, best.walk);
  }

  return picked;
}

const DAY_NOTES: Record<
  TaggedPlace["city"],
  { "zh-CN": string[]; en: string[] }
> = {
  kyoto: {
    "zh-CN": ["东山慢走", "伏见与岚山", "市集与巷子", "余白一日", "随心加站"],
    en: [
      "East hills stroll",
      "Fushimi & Arashiyama",
      "Market lanes",
      "Open day",
      "Add as you go",
    ],
  },
  shanghai: {
    "zh-CN": ["外滩夜色", "豫园半日", "城市余白"],
    en: ["Bund evening", "Yu Garden half-day", "City buffer"],
  },
  hangzhou: {
    "zh-CN": ["西湖环线", "茶馆余白"],
    en: ["West Lake loop", "Tea buffer"],
  },
  beijing: {
    "zh-CN": ["中轴文化", "余白一日"],
    en: ["Axis culture", "Open day"],
  },
  tokyo: {
    "zh-CN": ["市场清晨", "余白加站"],
    en: ["Market morning", "Open slots"],
  },
  other: {
    "zh-CN": ["第一天", "第二天", "第三天", "第四天", "第五天"],
    en: ["Day one", "Day two", "Day three", "Day four", "Day five"],
  },
};

export class DemoDayFillProvider implements DayFillProvider {
  readonly id = "demo-day-fill";

  async propose(ctx: DayFillContext): Promise<{
    days: DayFillProposedDay[];
    rationale?: string;
  }> {
    const interests = ctx.prefs.interests;
    const maxWalk = Math.max(20, Math.min(240, ctx.prefs.maxWalkMinutesPerDay));
    const perDay = stopsPerDayForWalkBudget(maxWalk);
    const dayCount = Math.max(
      1,
      Math.min(
        7,
        ctx.prefs.dayCount ??
          (ctx.days.length > 0 ? ctx.days.length : 3),
      ),
    );

    const city = inferCityHint(ctx.trip.destination, ctx.trip.timezone);
    const catalog = filterCatalogByCity(mergeCatalog(ctx), city);
    const existingByPlace = new Map(
      ctx.stops.map((s) => [s.place.enginePlaceId, s]),
    );

    // Prefer reusing existing stops first (reassign days), then fill from catalog.
    const existingTagged: TaggedPlace[] = ctx.stops.map((s) => {
      const hit = catalog.find((p) => p.enginePlaceId === s.place.enginePlaceId);
      return (
        hit ?? {
          ...placeFromStop(s),
          tags: ["culture" as const],
          city,
        }
      );
    });

    const pool = [
      ...existingTagged,
      ...catalog.filter(
        (p) => !existingByPlace.has(p.enginePlaceId),
      ),
    ];
    // Dedupe preserving order
    const seen = new Set<string>();
    const uniquePool: TaggedPlace[] = [];
    for (const p of pool) {
      if (seen.has(p.enginePlaceId)) continue;
      seen.add(p.enginePlaceId);
      uniquePool.push(p);
    }

    const usedIds = new Set<string>();
    const locale = ctx.locale ?? ctx.trip.locale ?? "zh-CN";
    const notes = DAY_NOTES[city][locale] ?? DAY_NOTES[city]["zh-CN"];
    const startDate =
      ctx.days[0]?.date ??
      ctx.trip.startDate ??
      todayIsoDate();

    // Spread a small catalog across days instead of packing day 1 full.
    const fairCap = Math.max(
      1,
      Math.min(
        perDay,
        Math.ceil(uniquePool.length / Math.max(1, dayCount)),
      ),
    );

    const days: DayFillProposedDay[] = [];
    for (let i = 0; i < dayCount; i++) {
      const existingDay = ctx.days[i];
      const remainingDays = dayCount - i;
      const remainingPlaces = uniquePool.filter(
        (p) => !usedIds.has(p.enginePlaceId),
      ).length;
      const dayCap = Math.max(
        1,
        Math.min(
          perDay,
          fairCap,
          Math.ceil(remainingPlaces / Math.max(1, remainingDays)),
        ),
      );
      const stops = packDay(
        uniquePool,
        usedIds,
        existingByPlace,
        interests,
        maxWalk,
        dayCap,
      );
      days.push({
        dayIndex: i,
        date: existingDay?.date ?? addDaysIso(startDate, i),
        note: existingDay?.note ?? notes[i % notes.length],
        stops,
      });
    }

    const rationale =
      locale === "en"
        ? `Demo fill · ${city} · interests ${interests.join(", ")} · ≤${maxWalk} min walk/day.`
        : `演示填天 · ${city} · 兴趣 ${interests.join("、")} · 每日步行 ≤${maxWalk} 分钟。`;

    return { days, rationale };
  }
}
