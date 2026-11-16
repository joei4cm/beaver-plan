import { DEMO_PLACES } from "./map/demo-data.js";
import type { PlaceRef, Trip } from "./domain.js";
import type { PlaceSummary } from "./ports.js";

/** Read-only “城市玩法” skeleton — days + stops, no journal/media. */
export type CityTemplateStop = {
  /** Matches DEMO_PLACES.enginePlaceId (or any known place id). */
  placeId: string;
  userNote?: string;
};

export type CityTemplateDay = {
  /** 0-based offset from trip startDate. */
  dayOffset: number;
  note?: string;
  stops: CityTemplateStop[];
};

export type LocalizedText = {
  "zh-CN": string;
  en: string;
};

export type CityTemplate = {
  id: string;
  title: LocalizedText;
  destination: string;
  description: LocalizedText;
  timezone: string;
  locale: Trip["locale"];
  /** Accent class hint for web list UI (Tailwind gradient). */
  accent: string;
  days: CityTemplateDay[];
};

function placeRefFromDemo(placeId: string): PlaceRef {
  const p = DEMO_PLACES.find((x) => x.enginePlaceId === placeId);
  if (!p) {
    throw new Error(`unknown_demo_place:${placeId}`);
  }
  return {
    engine: "google",
    enginePlaceId: p.enginePlaceId,
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
  };
}

/** Resolve a template stop to a PlaceRef (demo catalog). */
export function placeRefForTemplateStop(stop: CityTemplateStop): PlaceRef {
  return placeRefFromDemo(stop.placeId);
}

export function placeSummaryForTemplateStop(
  stop: CityTemplateStop,
): PlaceSummary {
  const ref = placeRefFromDemo(stop.placeId);
  return {
    enginePlaceId: ref.enginePlaceId,
    name: ref.name,
    address: ref.address,
    lat: ref.lat,
    lng: ref.lng,
  };
}

/** Add calendar days to an ISO date (YYYY-MM-DD). */
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD in UTC (good enough for template start). */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Seed city playbooks — Kyoto classic, Shanghai weekend, Hangzhou lake day.
 * Stored in code (no DB table); create-from-template materializes a real trip.
 */
export const CITY_TEMPLATES: CityTemplate[] = [
  {
    id: "kyoto-3day",
    title: {
      "zh-CN": "京都三日经典",
      en: "Kyoto · 3-day classic",
    },
    destination: "Kyoto",
    description: {
      "zh-CN": "东山 → 伏见岚山 → 市集：骨架日程，开箱即改。",
      en: "East hills → Fushimi & Arashiyama → market — edit-ready skeleton.",
    },
    timezone: "Asia/Tokyo",
    locale: "zh-CN",
    accent: "from-river/30 to-mist/40",
    days: [
      {
        dayOffset: 0,
        note: "东山 · 清水寺一带",
        stops: [
          { placeId: "demo-kiyomizu", userNote: "清晨上台" },
          { placeId: "demo-gion" },
        ],
      },
      {
        dayOffset: 1,
        note: "伏见 · 岚山",
        stops: [
          { placeId: "demo-fushimi" },
          { placeId: "demo-arashiyama" },
        ],
      },
      {
        dayOffset: 2,
        note: "市中心市场",
        stops: [{ placeId: "demo-nishiki" }],
      },
    ],
  },
  {
    id: "shanghai-weekend",
    title: {
      "zh-CN": "上海周末",
      en: "Shanghai weekend",
    },
    destination: "Shanghai",
    description: {
      "zh-CN": "外滩夜色 + 豫园半日，适合两天短休。",
      en: "The Bund at night + Yu Garden — a two-day reset.",
    },
    timezone: "Asia/Shanghai",
    locale: "zh-CN",
    accent: "from-timber/25 to-paper",
    days: [
      {
        dayOffset: 0,
        note: "外滩夜色",
        stops: [{ placeId: "demo-thebund", userNote: "日落前后" }],
      },
      {
        dayOffset: 1,
        note: "城隍庙 · 豫园",
        stops: [{ placeId: "demo-yuyuan" }],
      },
    ],
  },
  {
    id: "hangzhou-lake",
    title: {
      "zh-CN": "杭州西湖一日",
      en: "Hangzhou · West Lake day",
    },
    destination: "Hangzhou",
    description: {
      "zh-CN": "环湖慢走一天，留下空白可加茶馆与博物馆。",
      en: "One lake loop day — leave room for tea and museums.",
    },
    timezone: "Asia/Shanghai",
    locale: "zh-CN",
    accent: "from-mist/35 to-river/20",
    days: [
      {
        dayOffset: 0,
        note: "西湖环线",
        stops: [{ placeId: "demo-westlake", userNote: "从断桥或苏堤起步" }],
      },
    ],
  },
];

export function getCityTemplate(id: string): CityTemplate | undefined {
  return CITY_TEMPLATES.find((t) => t.id === id);
}

export type DuplicateTripOptions = {
  /** Copy journal body text; never copies media/photos. Default false. */
  copyJournal?: boolean;
};
