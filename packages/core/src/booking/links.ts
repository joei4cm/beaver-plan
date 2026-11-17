import type { BookingLink, BookingLinkKind } from "../domain.js";

export const BOOKING_LINK_KINDS: BookingLinkKind[] = [
  "hotel",
  "flight",
  "ticket",
];

export function isBookingLinkKind(value: unknown): value is BookingLinkKind {
  return (
    value === "hotel" || value === "flight" || value === "ticket"
  );
}

export type NormalizeBookingLinksOptions = {
  /** Max links stored per stop. */
  max?: number;
};

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate / coerce booking deep links from API or UI payloads.
 * Drops empty URLs; keeps at most one link per kind (hotel/flight/ticket).
 */
export function normalizeBookingLinks(
  raw: unknown,
  opts: NormalizeBookingLinksOptions = {},
): BookingLink[] {
  const max = opts.max ?? 3;
  if (!Array.isArray(raw)) return [];
  const byKind = new Map<BookingLinkKind, BookingLink>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (!isBookingLinkKind(rec.kind)) continue;
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!url || !isHttpUrl(url)) continue;
    const providerLabel =
      typeof rec.providerLabel === "string" && rec.providerLabel.trim()
        ? rec.providerLabel.trim().slice(0, 80)
        : undefined;
    const link: BookingLink = {
      kind: rec.kind,
      url: url.slice(0, 2048),
    };
    if (providerLabel) link.providerLabel = providerLabel;
    byKind.set(rec.kind, link);
  }
  const order: BookingLinkKind[] = ["hotel", "flight", "ticket"];
  return order
    .map((k) => byKind.get(k))
    .filter((x): x is BookingLink => Boolean(x))
    .slice(0, max);
}
