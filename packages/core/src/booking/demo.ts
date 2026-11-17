import type {
  BookingProvider,
  BookingSearchInput,
  BookingSuggestion,
  BookingSuggestionKind,
} from "./types.js";

type DemoRow = BookingSuggestion & { cityKeys: string[] };

const DEMO_CATALOG: DemoRow[] = [
  {
    id: "demo-hotel-kyoto-ryokan",
    kind: "hotel",
    title: "Higashiyama Riverside Ryokan",
    city: "Kyoto",
    cityKeys: ["kyoto", "京都", "京都市"],
    providerLabel: "DemoStay",
    url: "https://example.com/demo/hotels/higashiyama-ryokan",
    priceHint: "¥28,000〜",
    ratingHint: 4.7,
  },
  {
    id: "demo-hotel-kyoto-station",
    kind: "hotel",
    title: "Kyoto Station Nest Hotel",
    city: "Kyoto",
    cityKeys: ["kyoto", "京都", "京都市"],
    providerLabel: "DemoStay",
    url: "https://example.com/demo/hotels/kyoto-station-nest",
    priceHint: "¥16,500〜",
    ratingHint: 4.3,
  },
  {
    id: "demo-act-kiyomizu-night",
    kind: "activity",
    title: "Kiyomizu evening illumination ticket",
    city: "Kyoto",
    cityKeys: ["kyoto", "京都", "京都市"],
    providerLabel: "DemoTickets",
    url: "https://example.com/demo/tickets/kiyomizu-night",
    priceHint: "¥2,000",
    ratingHint: 4.8,
  },
  {
    id: "demo-hotel-shanghai-bund",
    kind: "hotel",
    title: "Bund Vista Boutique",
    city: "Shanghai",
    cityKeys: ["shanghai", "上海", "上海市"],
    providerLabel: "DemoStay",
    url: "https://example.com/demo/hotels/bund-vista",
    priceHint: "¥980〜",
    ratingHint: 4.5,
  },
  {
    id: "demo-act-bund-cruise",
    kind: "activity",
    title: "Huangpu River night cruise",
    city: "Shanghai",
    cityKeys: ["shanghai", "上海", "上海市"],
    providerLabel: "DemoTickets",
    url: "https://example.com/demo/tickets/huangpu-cruise",
    priceHint: "¥120",
    ratingHint: 4.4,
  },
  {
    id: "demo-hotel-tokyo-shinjuku",
    kind: "hotel",
    title: "Shinjuku Sky Loft",
    city: "Tokyo",
    cityKeys: ["tokyo", "东京", "東京", "东京市", "東京都"],
    providerLabel: "DemoStay",
    url: "https://example.com/demo/hotels/shinjuku-sky",
    priceHint: "¥22,000〜",
    ratingHint: 4.6,
  },
  {
    id: "demo-act-teamlab",
    kind: "activity",
    title: "teamLab Planets timed entry",
    city: "Tokyo",
    cityKeys: ["tokyo", "东京", "東京", "东京市", "東京都"],
    providerLabel: "DemoTickets",
    url: "https://example.com/demo/tickets/teamlab-planets",
    priceHint: "¥3,800",
    ratingHint: 4.9,
  },
  {
    id: "demo-hotel-generic",
    kind: "hotel",
    title: "City Center Traveler Inn",
    city: "Anywhere",
    cityKeys: ["*"],
    providerLabel: "DemoStay",
    url: "https://example.com/demo/hotels/city-center-inn",
    priceHint: "from mid-range",
    ratingHint: 4.1,
  },
  {
    id: "demo-act-generic",
    kind: "activity",
    title: "Old town walking tour",
    city: "Anywhere",
    cityKeys: ["*"],
    providerLabel: "DemoTickets",
    url: "https://example.com/demo/tickets/old-town-walk",
    priceHint: "from ¥3,500",
    ratingHint: 4.2,
  },
];

function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

function matchesCity(row: DemoRow, city: string): boolean {
  const n = normalizeCity(city);
  if (!n) return true;
  if (row.cityKeys.includes("*")) return true;
  return row.cityKeys.some((k) => n.includes(k.toLowerCase()) || k.toLowerCase().includes(n));
}

function filterKind(
  kind: BookingSuggestionKind | "all" | undefined,
  row: DemoRow,
): boolean {
  if (!kind || kind === "all") return true;
  return row.kind === kind;
}

function withDates(
  row: DemoRow,
  checkIn?: string,
  checkOut?: string,
): BookingSuggestion {
  const url = new URL(row.url);
  if (checkIn) url.searchParams.set("checkIn", checkIn);
  if (checkOut) url.searchParams.set("checkOut", checkOut);
  const { cityKeys: _keys, ...rest } = row;
  return { ...rest, url: url.toString() };
}

/**
 * Curated mock hotels + activities. No network, no API keys.
 */
export class DemoBookingProvider implements BookingProvider {
  readonly id = "demo-booking";

  async search(input: BookingSearchInput): Promise<BookingSuggestion[]> {
    const kind = input.kind ?? "all";
    const matched = DEMO_CATALOG.filter(
      (row) => matchesCity(row, input.city) && filterKind(kind, row),
    );
    const specific = matched.filter((r) => !r.cityKeys.includes("*"));
    const pool = specific.length > 0 ? specific : matched;
    return pool.slice(0, 6).map((row) =>
      withDates(row, input.checkIn, input.checkOut),
    );
  }
}

/** Exported for tests / UI demos. */
export function demoBookingCatalog(): BookingSuggestion[] {
  return DEMO_CATALOG.map(({ cityKeys: _k, ...rest }) => rest);
}
