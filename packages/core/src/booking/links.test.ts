import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeBookingLinks } from "./links.js";
import { createBookingStack } from "./factory.js";

describe("normalizeBookingLinks", () => {
  it("keeps one valid link per kind (last wins)", () => {
    const links = normalizeBookingLinks([
      {
        kind: "hotel",
        url: "https://booking.example/hotel/1",
        providerLabel: "Booking.com",
      },
      {
        kind: "hotel",
        url: "https://booking.example/hotel/2",
        providerLabel: "Duplicate dropped",
      },
      { kind: "flight", url: "https://flights.example/a", providerLabel: "Expedia" },
      { kind: "ticket", url: "not-a-url" },
      { kind: "ticket", url: "https://tickets.example/t" },
    ]);
    assert.deepEqual(links, [
      {
        kind: "hotel",
        url: "https://booking.example/hotel/2",
        providerLabel: "Duplicate dropped",
      },
      {
        kind: "flight",
        url: "https://flights.example/a",
        providerLabel: "Expedia",
      },
      { kind: "ticket", url: "https://tickets.example/t" },
    ]);
  });

  it("returns empty for junk", () => {
    assert.deepEqual(normalizeBookingLinks(null), []);
    assert.deepEqual(normalizeBookingLinks([{ kind: "hotel", url: "" }]), []);
  });
});

describe("createBookingStack", () => {
  it("defaults to demo without keys", async () => {
    const stack = createBookingStack({});
    assert.equal(stack.mode, "demo");
    const rows = await stack.provider.search({ city: "Kyoto" });
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((r) => r.url.startsWith("https://")));
  });

  it("marks configured when affiliate id present", async () => {
    const stack = createBookingStack({
      bookingAffiliateId: "demo-aid",
    });
    assert.equal(stack.mode, "configured");
    const rows = await stack.provider.search({ city: "Tokyo", kind: "hotel" });
    assert.ok(rows.some((r) => r.url.includes("aid=demo-aid")));
  });
});
