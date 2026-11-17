/** OTA / booking search stub — suggestions only, no checkout. */

export type BookingSuggestionKind = "hotel" | "activity";

export type BookingSuggestion = {
  id: string;
  kind: BookingSuggestionKind;
  title: string;
  city: string;
  providerLabel: string;
  /** External deep link (demo or affiliate-shaped). */
  url: string;
  /** Soft price hint for UI, e.g. "¥12,000〜" — never a charge. */
  priceHint?: string;
  ratingHint?: number;
};

export type BookingSearchInput = {
  city: string;
  /** YYYY-MM-DD */
  checkIn?: string;
  /** YYYY-MM-DD */
  checkOut?: string;
  kind?: BookingSuggestionKind | "all";
  locale?: "zh-CN" | "en";
};

export type BookingSearchResult = {
  suggestions: BookingSuggestion[];
  mode: "demo" | "configured";
  provider: string;
};

export type BookingProvider = {
  id: string;
  search(input: BookingSearchInput): Promise<BookingSuggestion[]>;
};

export type BookingStack = {
  provider: BookingProvider;
  /**
   * `demo` — no OTA keys; curated mock catalog.
   * `configured` — Amadeus / Booking affiliate env present; still mock catalog
   * until a real live adapter is wired (suggestions may carry affiliate-shaped URLs).
   */
  mode: "demo" | "configured";
};
