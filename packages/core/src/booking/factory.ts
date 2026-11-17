import { DemoBookingProvider } from "./demo.js";
import type { BookingStack } from "./types.js";

export type BookingKeyBag = {
  /** amadeus | booking | demo | auto — default auto */
  otaProvider?: string;
  /** Amadeus self-service API key (document only until live adapter). */
  amadeusApiKey?: string;
  amadeusApiSecret?: string;
  /** Booking.com affiliate id / aid (document only until live adapter). */
  bookingAffiliateId?: string;
};

function hasLiveKeys(keys: BookingKeyBag): boolean {
  const amadeus = Boolean(
    keys.amadeusApiKey?.trim() && keys.amadeusApiSecret?.trim(),
  );
  const booking = Boolean(keys.bookingAffiliateId?.trim());
  return amadeus || booking;
}

/**
 * Build booking / OTA search stack.
 * Missing keys (or OTA_PROVIDER=demo) → curated demo catalog.
 * Keys present → still demo catalog for now (`mode: "configured"`), with
 * affiliate-shaped URL decoration when a Booking affiliate id is set.
 * No fake secrets; no real Amadeus/Booking HTTP until a live adapter lands.
 */
export function createBookingStack(keys: BookingKeyBag): BookingStack {
  const pref = (keys.otaProvider ?? "auto").toLowerCase();
  const configured = hasLiveKeys(keys) && pref !== "demo";
  const provider = new DemoBookingProvider();

  if (configured && keys.bookingAffiliateId?.trim()) {
    const aid = keys.bookingAffiliateId.trim();
    return {
      mode: "configured",
      provider: {
        id: "demo-booking-affiliate-stub",
        async search(input) {
          const rows = await provider.search(input);
          return rows.map((row) => {
            try {
              const url = new URL(row.url);
              url.searchParams.set("aid", aid);
              url.searchParams.set("label", "beaver-plan");
              return {
                ...row,
                providerLabel: `${row.providerLabel} · affiliate stub`,
                url: url.toString(),
              };
            } catch {
              return row;
            }
          });
        },
      },
    };
  }

  return {
    provider,
    mode: configured ? "configured" : "demo",
  };
}

export function reportBookingCapabilities(stack: BookingStack): {
  mode: "demo" | "configured";
  provider: string;
} {
  return {
    mode: stack.mode,
    provider: stack.provider.id,
  };
}
