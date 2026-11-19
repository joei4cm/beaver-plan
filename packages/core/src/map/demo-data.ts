import type { PlaceSummary } from "../ports.js";

type DemoPlace = PlaceSummary & {
  /** Extra tokens for client/BFF search (English names, aliases). */
  keywords?: string[];
};

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
 * Substring search over curated POIs. Empty / no-hit queries still return
 * the catalog head so the planner never shows an empty stub.
 */
export function searchDemoPlaces(text: string, limit = 8): PlaceSummary[] {
  const q = text.trim().toLowerCase();
  if (!q) {
    return DEMO_PLACES.slice(0, limit).map(stripKeywords);
  }
  const hits = DEMO_PLACES.filter((p) => placeHaystack(p).includes(q));
  // Prefer Kyoto-ish hits when the query looks Japanese / Kyoto-related.
  const ranked =
    hits.length > 0
      ? hits
      : DEMO_PLACES.filter((p) =>
          /kyoto|京都|清水|伏见|岚山|祇园|锦|金阁|二条|哲学|东福|inari|kiyomizu|gion|arashiyama/.test(
            placeHaystack(p),
          ),
        );
  const pool = ranked.length > 0 ? ranked : DEMO_PLACES;
  return pool.slice(0, limit).map(stripKeywords);
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
