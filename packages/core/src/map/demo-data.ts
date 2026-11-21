import type { PlaceDetails, PlaceSummary } from "../ports.js";

type DemoPlace = PlaceSummary & {
  /** Extra tokens for client/BFF search (English names, aliases). */
  keywords?: string[];
};

/** Curated place intel for planner stop cards (demo / soft-fail). */
export type DemoPlaceIntel = {
  rating: number;
  hoursZh: string;
  hoursEn: string;
  summaryZh: string;
  summaryEn: string;
};

export const DEMO_PLACE_INTEL: Record<string, DemoPlaceIntel> = {
  "demo-fushimi": {
    rating: 4.7,
    hoursZh: "06:00–17:00",
    hoursEn: "06:00–17:00",
    summaryZh: "千本鸟居与稻荷山步道，京都标志性神社。",
    summaryEn: "Thousand torii gates and Inari mountain paths — Kyoto’s iconic shrine.",
  },
  "demo-kiyomizu": {
    rating: 4.6,
    hoursZh: "06:00–18:00",
    hoursEn: "06:00–18:00",
    summaryZh: "清水舞台远眺东山，春季樱花与秋枫最盛。",
    summaryEn: "Kiyomizu stage overlooks Higashiyama — peak cherry and maple seasons.",
  },
  "demo-arashiyama": {
    rating: 4.5,
    hoursZh: "全天开放",
    hoursEn: "Open all day",
    summaryZh: "嵯峨竹林小径与渡月桥一带，适合慢走拍照。",
    summaryEn: "Saga bamboo grove and Togetsukyo — best for a slow photo walk.",
  },
  "demo-gion": {
    rating: 4.4,
    hoursZh: "街区全天 · 茶屋傍晚更盛",
    hoursEn: "District all day · teahouses best at dusk",
    summaryZh: "花见小路与茶屋街，夜间灯火最有京都味。",
    summaryEn: "Hanami-koji and teahouse lanes — Kyoto atmosphere peaks after dusk.",
  },
  "demo-nishiki": {
    rating: 4.3,
    hoursZh: "10:00–18:00（店铺各异）",
    hoursEn: "10:00–18:00 (varies by stall)",
    summaryZh: "京都厨房：腌菜、海鲜与京菓子一条街。",
    summaryEn: "Kyoto’s kitchen — pickles, seafood, and sweets in one covered market.",
  },
  "demo-kinkaku": {
    rating: 4.6,
    hoursZh: "09:00–17:00",
    hoursEn: "09:00–17:00",
    summaryZh: "镜湖池映金阁，北山经典打卡。",
    summaryEn: "Golden Pavilion mirrored on Kyoko-chi — classic Kitayama stop.",
  },
  "demo-nijo": {
    rating: 4.5,
    hoursZh: "08:45–17:00",
    hoursEn: "08:45–17:00",
    summaryZh: "德川行宫与「鸣莺廊」，城堡与庭园并赏。",
    summaryEn: "Tokugawa palace and nightingale floors — castle and gardens together.",
  },
  "demo-philosophers": {
    rating: 4.4,
    hoursZh: "步道全天",
    hoursEn: "Path open all day",
    summaryZh: "疏水旁樱花步道，适合从银阁寺走向南禅寺。",
    summaryEn: "Canal-side cherry path — stroll from Ginkaku-ji toward Nanzen-ji.",
  },
  "demo-tofukuji": {
    rating: 4.5,
    hoursZh: "09:00–16:00",
    hoursEn: "09:00–16:00",
    summaryZh: "通天桥红叶与禅寺庭园，秋季人气最高。",
    summaryEn: "Tsutenkyo bridge maples and zen gardens — autumn crowds peak here.",
  },
  "demo-thebund": {
    rating: 4.6,
    hoursZh: "滨江步道全天",
    hoursEn: "Waterfront promenade all day",
    summaryZh: "浦江天际线与历史建筑立面，夜景最出片。",
    summaryEn: "Huangpu skyline and historic façades — best after dark.",
  },
  "demo-yuyuan": {
    rating: 4.3,
    hoursZh: "09:00–16:30",
    hoursEn: "09:00–16:30",
    summaryZh: "豫园园林与城隍庙市集，上海老城厢一站。",
    summaryEn: "Classical garden and City God bazaar — old Shanghai in one stop.",
  },
  "demo-westlake": {
    rating: 4.7,
    hoursZh: "环湖全天",
    hoursEn: "Lakeside all day",
    summaryZh: "断桥残雪与苏堤春晓，杭城必走湖岸。",
    summaryEn: "Broken Bridge and Su Causeway — Hangzhou’s essential lakeshore.",
  },
  "demo-forbidden": {
    rating: 4.8,
    hoursZh: "08:30–17:00",
    hoursEn: "08:30–17:00",
    summaryZh: "紫禁城中轴线与宫殿院落，建议预留半日。",
    summaryEn: "Forbidden City axis and courtyards — plan a half-day visit.",
  },
  "demo-tsukiji": {
    rating: 4.4,
    hoursZh: "05:00–14:00（店铺各异）",
    hoursEn: "05:00–14:00 (varies by stall)",
    summaryZh: "场外市场海鲜早餐与刀具店，清晨人气最高。",
    summaryEn: "Outer market seafood breakfast and knife shops — busiest at dawn.",
  },
};

const DEFAULT_INTEL: DemoPlaceIntel = {
  rating: 4.5,
  hoursZh: "09:00–17:00",
  hoursEn: "09:00–17:00",
  summaryZh: "演示地点 — 配置地图密钥后可拉取实时 Places 详情。",
  summaryEn: "Demo place — live Places details appear once map keys are configured.",
};

/**
 * Soft-fail place details for planner intel cards when Neon / Places keys
 * are absent, or when the BFF is unreachable from the web shell.
 */
export function getDemoPlaceDetails(
  id: string,
  language?: string,
  tags?: string[],
): PlaceDetails {
  const found = DEMO_PLACES.find((p) => p.enginePlaceId === id);
  const intel = DEMO_PLACE_INTEL[id] ?? DEFAULT_INTEL;
  const en = (language ?? "zh-CN").toLowerCase().startsWith("en");
  const hours = [en ? intel.hoursEn : intel.hoursZh];
  const base: PlaceDetails = found
    ? {
        enginePlaceId: found.enginePlaceId,
        name: found.name,
        address: found.address,
        lat: found.lat,
        lng: found.lng,
        rating: intel.rating,
        openingHours: hours,
        summary: en ? intel.summaryEn : intel.summaryZh,
        raw: { demo: true },
      }
    : {
        enginePlaceId: id,
        name: en ? "Demo place" : "演示地点",
        lat: 35.0116,
        lng: 135.7681,
        rating: intel.rating,
        openingHours: hours,
        summary: en ? intel.summaryEn : intel.summaryZh,
        raw: { demo: true },
      };
  if (tags && tags.length > 0) base.tags = [...tags];
  return base;
}

/** Curated demo POIs so the planner works without map API keys. */
export const DEMO_PLACES: DemoPlace[] = [
  {
    enginePlaceId: "demo-fushimi",
    name: "伏见稻荷大社",
    address: "京都府京都市伏见区深草薮之内町68",
    lat: 34.9671,
    lng: 135.7727,
    keywords: ["fushimi", "inari", "千本鸟居", "fushimi-inari"],
  },
  {
    enginePlaceId: "demo-kiyomizu",
    name: "清水寺",
    address: "京都府京都市东山区清水1-294",
    lat: 34.9949,
    lng: 135.785,
    keywords: ["kiyomizu", "kiyomizudera", "清水"],
  },
  {
    enginePlaceId: "demo-arashiyama",
    name: "岚山竹林",
    address: "京都府京都市右京区嵯峨小川町",
    lat: 35.017,
    lng: 135.6717,
    keywords: ["arashiyama", "bamboo", "竹林", "saga"],
  },
  {
    enginePlaceId: "demo-gion",
    name: "祗园",
    address: "京都府京都市东山区祇园町",
    lat: 35.0037,
    lng: 135.7786,
    keywords: ["gion", "geisha", "祇园"],
  },
  {
    enginePlaceId: "demo-nishiki",
    name: "锦市场",
    address: "京都府京都市中京区锦小路通",
    lat: 35.0051,
    lng: 135.7649,
    keywords: ["nishiki", "market", "锦"],
  },
  {
    enginePlaceId: "demo-kinkaku",
    name: "金阁寺",
    address: "京都府京都市北区金阁寺町1",
    lat: 35.0394,
    lng: 135.7292,
    keywords: ["kinkaku", "kinkakuji", "golden pavilion", "金阁"],
  },
  {
    enginePlaceId: "demo-nijo",
    name: "二条城",
    address: "京都府京都市中京区二条通堀川西入二条城町541",
    lat: 35.0142,
    lng: 135.7482,
    keywords: ["nijo", "nijocastle", "二条"],
  },
  {
    enginePlaceId: "demo-philosophers",
    name: "哲学之道",
    address: "京都府京都市左京区",
    lat: 35.0264,
    lng: 135.7956,
    keywords: ["philosopher", "philosophers path", "哲道", "tetsugaku"],
  },
  {
    enginePlaceId: "demo-tofukuji",
    name: "东福寺",
    address: "京都府京都市东山区本町15-778",
    lat: 34.9809,
    lng: 135.7737,
    keywords: ["tofuku", "tofukuji", "东福"],
  },
  {
    enginePlaceId: "demo-thebund",
    name: "外滩",
    address: "上海市黄浦区中山东一路",
    lat: 31.2404,
    lng: 121.4905,
    keywords: ["bund", "waitan", "shanghai"],
  },
  {
    enginePlaceId: "demo-yuyuan",
    name: "豫园",
    address: "上海市黄浦区福佑路168号",
    lat: 31.2272,
    lng: 121.4921,
    keywords: ["yuyuan", "yu garden"],
  },
  {
    enginePlaceId: "demo-westlake",
    name: "西湖",
    address: "浙江省杭州市西湖区",
    lat: 30.242,
    lng: 120.1485,
    keywords: ["west lake", "xihu", "hangzhou"],
  },
  {
    enginePlaceId: "demo-forbidden",
    name: "故宫",
    address: "北京市东城区景山前街4号",
    lat: 39.9163,
    lng: 116.3972,
    keywords: ["forbidden city", "palace museum", "gugong"],
  },
  {
    enginePlaceId: "demo-tsukiji",
    name: "筑地场外市场",
    address: "東京都中央区築地4丁目",
    lat: 35.6654,
    lng: 139.7707,
    keywords: ["tsukiji", "tokyo market"],
  },
];

function placeHaystack(p: DemoPlace): string {
  return [
    p.name,
    p.address ?? "",
    p.enginePlaceId,
    ...(p.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Substring search over curated POIs.
 * No-hit queries return [] so the planner can soft-fail empty (not a silent stub).
 */
export function searchDemoPlaces(text: string, limit = 8): PlaceSummary[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const hits = DEMO_PLACES.filter((p) => placeHaystack(p).includes(q));
  return hits.slice(0, limit).map(stripKeywords);
}

function stripKeywords(p: DemoPlace): PlaceSummary {
  return {
    enginePlaceId: p.enginePlaceId,
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
  };
}
