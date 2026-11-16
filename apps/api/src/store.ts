import type {
  Day,
  JournalEntry,
  Leg,
  ShareArtifact,
  Stop,
  Trip,
} from "@beaver/core";
import { DEMO_PLACES } from "@beaver/core";
import {
  makePlaceholderSvg,
  mediaPublicPath,
  putMedia,
} from "./media-store.js";

/** In-memory stub store — Neon/Drizzle still later; no fake migrations. */
export const trips = new Map<string, Trip>();
export const daysByTrip = new Map<string, Day[]>();
export const stopsByTrip = new Map<string, Stop[]>();
export const legsByTrip = new Map<string, Leg[]>();
export const journalByTrip = new Map<string, JournalEntry[]>();
export const shareByTrip = new Map<string, ShareArtifact[]>();

export function nowIso() {
  return new Date().toISOString();
}

/** Seed a Kyoto sample trip so Web/Mobile can open a planner without auth. */
export function ensureSampleTrip() {
  const id = "sample-kyoto";
  if (trips.has(id)) return;

  const stamp = nowIso();
  const trip: Trip = {
    id,
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
  trips.set(id, trip);

  const days: Day[] = [
    { id: "day-kyoto-1", tripId: id, date: "2026-04-10", note: "东山 · 清水寺一带" },
    { id: "day-kyoto-2", tripId: id, date: "2026-04-11", note: "伏见 · 岚山" },
    { id: "day-kyoto-3", tripId: id, date: "2026-04-12", note: "市中心市场" },
  ];
  daysByTrip.set(id, days);

  const pick = (enginePlaceId: string) => {
    const p = DEMO_PLACES.find((x) => x.enginePlaceId === enginePlaceId)!;
    return {
      engine: "google" as const,
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
    },
    {
      id: "stop-gion",
      dayId: "day-kyoto-1",
      order: 1,
      place: pick("demo-gion"),
      photos: [],
    },
    {
      id: "stop-fushimi",
      dayId: "day-kyoto-2",
      order: 0,
      place: pick("demo-fushimi"),
      photos: [],
    },
    {
      id: "stop-arashiyama",
      dayId: "day-kyoto-2",
      order: 1,
      place: pick("demo-arashiyama"),
      photos: [],
    },
    {
      id: "stop-nishiki",
      dayId: "day-kyoto-3",
      order: 0,
      place: pick("demo-nishiki"),
      photos: [],
    },
  ];
  stopsByTrip.set(id, stops);
  legsByTrip.set(id, []);

  const m1 = putMedia({
    id: "demo-photo-kiyomizu",
    bytes: makePlaceholderSvg({
      title: "清水寺",
      subtitle: "East Kyoto · morning mist",
      tone: "river",
    }),
    contentType: "image/svg+xml",
    tripId: id,
  });
  const m2 = putMedia({
    id: "demo-photo-gion",
    bytes: makePlaceholderSvg({
      title: "祇园",
      subtitle: "Lantern lanes",
      tone: "timber",
    }),
    contentType: "image/svg+xml",
    tripId: id,
  });
  const m3 = putMedia({
    id: "demo-photo-fushimi",
    bytes: makePlaceholderSvg({
      title: "伏见稻荷",
      subtitle: "Torii path",
      tone: "mist",
    }),
    contentType: "image/svg+xml",
    tripId: id,
  });
  const m4 = putMedia({
    id: "demo-photo-arashiyama",
    bytes: makePlaceholderSvg({
      title: "岚山",
      subtitle: "Bamboo light",
      tone: "river",
    }),
    contentType: "image/svg+xml",
    tripId: id,
  });

  const journal: JournalEntry[] = [
    {
      id: "journal-day1",
      tripId: id,
      dayId: "day-kyoto-1",
      body: "清晨爬上清水舞台，雾气还挂在屋檐上。",
      media: [mediaPublicPath(m1.id), mediaPublicPath(m2.id)],
      createdAt: "2026-04-10T09:20:00.000Z",
      updatedAt: "2026-04-10T09:20:00.000Z",
    },
    {
      id: "journal-stop-gion",
      tripId: id,
      dayId: "day-kyoto-1",
      stopId: "stop-gion",
      body: "巷子里的灯笼一盏盏亮起来。",
      media: [mediaPublicPath(m2.id)],
      createdAt: "2026-04-10T18:40:00.000Z",
      updatedAt: "2026-04-10T18:40:00.000Z",
    },
    {
      id: "journal-day2",
      tripId: id,
      dayId: "day-kyoto-2",
      body: "千本鸟居与竹林，一天两条路径。",
      media: [mediaPublicPath(m3.id), mediaPublicPath(m4.id)],
      createdAt: "2026-04-11T16:10:00.000Z",
      updatedAt: "2026-04-11T16:10:00.000Z",
    },
  ];
  journalByTrip.set(id, journal);
  shareByTrip.set(id, []);
}
