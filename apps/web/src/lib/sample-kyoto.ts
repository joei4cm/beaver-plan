import type { Day, Leg, PlaceRef, Stop, Trip } from "@beaver/core";
import { DEMO_PLACES, buildDemoTransitRoute } from "@beaver/core";

/** Frontend-only demo payload when Neon is not configured (screenshots / offline shell). */
export function sampleKyotoFixture(): {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
} {
  const stamp = "2026-04-01T00:00:00.000Z";
  const trip: Trip = {
    id: "sample-kyoto",
    title: "京都五日",
    destination: "Kyoto",
    startDate: "2026-04-10",
    endDate: "2026-04-14",
    timezone: "Asia/Tokyo",
    locale: "zh-CN",
    mapEngine: "auto",
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
  };

  const days: Day[] = [
    { id: "day-kyoto-1", tripId: trip.id, date: "2026-04-10", note: "东山 · 清水寺一带" },
    { id: "day-kyoto-2", tripId: trip.id, date: "2026-04-11", note: "伏见 · 岚山" },
    { id: "day-kyoto-3", tripId: trip.id, date: "2026-04-12", note: "市中心市场" },
  ];

  const pick = (enginePlaceId: string): PlaceRef => {
    const p = DEMO_PLACES.find((x) => x.enginePlaceId === enginePlaceId)!;
    return {
      engine: "google",
      enginePlaceId: p.enginePlaceId,
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
    };
  };

  const stops: Stop[] = [
    {
      id: "stop-kiyomizu",
      dayId: "day-kyoto-1",
      order: 0,
      place: pick("demo-kiyomizu"),
      photos: [],
      bookingLinks: [],
    },
    {
      id: "stop-gion",
      dayId: "day-kyoto-1",
      order: 1,
      place: pick("demo-gion"),
      photos: [],
      bookingLinks: [],
    },
    {
      id: "stop-fushimi",
      dayId: "day-kyoto-2",
      order: 0,
      place: pick("demo-fushimi"),
      photos: [],
      bookingLinks: [],
    },
    {
      id: "stop-arashiyama",
      dayId: "day-kyoto-2",
      order: 1,
      place: pick("demo-arashiyama"),
      photos: [],
      bookingLinks: [],
    },
    {
      id: "stop-nishiki",
      dayId: "day-kyoto-3",
      order: 0,
      place: pick("demo-nishiki"),
      photos: [],
      bookingLinks: [],
    },
  ];

  const legs: Leg[] = [];
  for (const [fromId, toId] of [
    ["stop-kiyomizu", "stop-gion"],
    ["stop-fushimi", "stop-arashiyama"],
  ] as const) {
    const from = stops.find((s) => s.id === fromId)!;
    const to = stops.find((s) => s.id === toId)!;
    const result = buildDemoTransitRoute(
      { lat: from.place.lat, lng: from.place.lng },
      { lat: to.place.lat, lng: to.place.lng },
      "zh-CN",
    );
    legs.push({
      id: `leg-${fromId}-${toId}`,
      fromStopId: fromId,
      toStopId: toId,
      mode: "transit",
      durationSec: result.durationSec,
      distanceM: result.distanceM,
      polyline: result.polyline,
      transitSteps: result.transitSteps,
    });
  }

  return { trip, days, stops, legs };
}
