import type { PlaceSummary } from "../ports.js";

/** Curated demo POIs so the planner works without map API keys. */
export const DEMO_PLACES: PlaceSummary[] = [
  {
    enginePlaceId: "demo-fushimi",
    name: "伏见稻荷大社",
    address: "京都府京都市伏见区深草薮之内町68",
    lat: 34.9671,
    lng: 135.7727,
  },
  {
    enginePlaceId: "demo-kiyomizu",
    name: "清水寺",
    address: "京都府京都市东山区清水1-294",
    lat: 34.9949,
    lng: 135.785,
  },
  {
    enginePlaceId: "demo-arashiyama",
    name: "岚山竹林",
    address: "京都府京都市右京区嵯峨小川町",
    lat: 35.017,
    lng: 135.6717,
  },
  {
    enginePlaceId: "demo-gion",
    name: "祗园",
    address: "京都府京都市东山区祇园町",
    lat: 35.0037,
    lng: 135.7786,
  },
  {
    enginePlaceId: "demo-nishiki",
    name: "锦市场",
    address: "京都府京都市中京区锦小路通",
    lat: 35.0051,
    lng: 135.7649,
  },
  {
    enginePlaceId: "demo-thebund",
    name: "外滩",
    address: "上海市黄浦区中山东一路",
    lat: 31.2404,
    lng: 121.4905,
  },
  {
    enginePlaceId: "demo-yuyuan",
    name: "豫园",
    address: "上海市黄浦区福佑路168号",
    lat: 31.2272,
    lng: 121.4921,
  },
  {
    enginePlaceId: "demo-westlake",
    name: "西湖",
    address: "浙江省杭州市西湖区",
    lat: 30.242,
    lng: 120.1485,
  },
  {
    enginePlaceId: "demo-forbidden",
    name: "故宫",
    address: "北京市东城区景山前街4号",
    lat: 39.9163,
    lng: 116.3972,
  },
  {
    enginePlaceId: "demo-tsukiji",
    name: "筑地场外市场",
    address: "東京都中央区築地4丁目",
    lat: 35.6654,
    lng: 139.7707,
  },
];

export function searchDemoPlaces(text: string, limit = 8): PlaceSummary[] {
  const q = text.trim().toLowerCase();
  if (!q) return DEMO_PLACES.slice(0, limit);
  const hits = DEMO_PLACES.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.address?.toLowerCase().includes(q) ?? false) ||
      p.enginePlaceId.includes(q),
  );
  return (hits.length > 0 ? hits : DEMO_PLACES).slice(0, limit);
}
