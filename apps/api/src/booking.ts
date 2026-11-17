import { Hono } from "hono";
import {
  createBookingStack,
  reportBookingCapabilities,
  type BookingSuggestionKind,
} from "@beaver/core";
import type { AuthVariables } from "./auth.js";
import type { Bindings } from "./env.js";

export const bookingRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

function stackFrom(env: Bindings) {
  return createBookingStack({
    otaProvider: env.OTA_PROVIDER,
    amadeusApiKey: env.AMADEUS_API_KEY,
    amadeusApiSecret: env.AMADEUS_API_SECRET,
    bookingAffiliateId: env.BOOKING_AFFILIATE_ID,
  });
}

bookingRoutes.get("/v1/booking/status", (c) => {
  const stack = stackFrom(c.env);
  return c.json({
    ...reportBookingCapabilities(stack),
    keys: {
      amadeus: Boolean(
        c.env.AMADEUS_API_KEY?.trim() && c.env.AMADEUS_API_SECRET?.trim(),
      ),
      bookingAffiliate: Boolean(c.env.BOOKING_AFFILIATE_ID?.trim()),
    },
    note:
      "Search returns demo hotel/activity suggestions without keys. Set AMADEUS_* or BOOKING_AFFILIATE_ID for a future live adapter (currently still mock catalog; no payment capture).",
  });
});

type SearchBody = {
  city?: string;
  checkIn?: string;
  checkOut?: string;
  kind?: BookingSuggestionKind | "all";
  locale?: "zh-CN" | "en";
};

/**
 * Optional affiliate / search stub.
 * Given city + dates → demo hotel / activity suggestions (no inventory sync).
 */
bookingRoutes.post("/v1/booking/search", async (c) => {
  let body: SearchBody;
  try {
    body = await c.req.json<SearchBody>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const city = typeof body.city === "string" ? body.city.trim() : "";
  if (!city) return c.json({ error: "city_required" }, 400);

  const stack = stackFrom(c.env);
  const suggestions = await stack.provider.search({
    city,
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    kind: body.kind ?? "all",
    locale: body.locale,
  });

  return c.json({
    city,
    checkIn: body.checkIn ?? null,
    checkOut: body.checkOut ?? null,
    suggestions,
    mode: stack.mode,
    provider: stack.provider.id,
  });
});
