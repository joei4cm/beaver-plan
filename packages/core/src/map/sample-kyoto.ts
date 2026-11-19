import type {
  ActivityEvent,
  Day,
  JournalEntry,
  Leg,
  PlaceRef,
  Stop,
  Trip,
  TripComment,
  TripMember,
  TripRole,
} from "../domain.js";
import { DEMO_PLACES } from "./demo-data.js";
import { buildDemoTransitRoute } from "./demo-transit.js";
import { parseMentions } from "../collab.js";

/** Lumen Route azure media placeholders (data URLs — no R2 required). */
export function lumenJournalPlaceholder(opts: {
  title: string;
  subtitle: string;
  tone?: "river" | "sky" | "mist";
}): string {
  const tones = {
    river: ["#1A4FD6", "#2F6BFF"],
    sky: ["#60A5FA", "#DBE8FF"],
    mist: ["#64748B", "#94A3B8"],
  } as const;
  const [a, b] = tones[opts.tone ?? "river"];
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a}"/>
      <stop offset="100%" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1200" fill="url(#g)"/>
  <circle cx="720" cy="220" r="160" fill="#ffffff" opacity="0.14"/>
  <circle cx="140" cy="980" r="220" fill="#ffffff" opacity="0.08"/>
  <text x="56" y="1040" fill="#F4F6FA" font-family="Bricolage Grotesque, Plus Jakarta Sans, sans-serif" font-size="48" font-weight="700">${esc(opts.title)}</text>
  <text x="56" y="1100" fill="#E6ECF5" font-family="Plus Jakarta Sans, sans-serif" font-size="24">${esc(opts.subtitle)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Sample Kyoto journal entries with inline media placeholders (soft-fail without Neon/R2). */
export function sampleKyotoJournal(): JournalEntry[] {
  const media = {
    kiyomizu: lumenJournalPlaceholder({
      title: "清水寺",
      subtitle: "East Kyoto · morning mist",
      tone: "river",
    }),
    gion: lumenJournalPlaceholder({
      title: "祇园",
      subtitle: "Lantern lanes",
      tone: "mist",
    }),
    fushimi: lumenJournalPlaceholder({
      title: "伏见稻荷",
      subtitle: "Torii path",
      tone: "sky",
    }),
    arashiyama: lumenJournalPlaceholder({
      title: "岚山",
      subtitle: "Bamboo light",
      tone: "river",
    }),
  };
  return [
    {
      id: "journal-day1",
      tripId: "sample-kyoto",
      dayId: "day-kyoto-1",
      body: "清晨爬上清水舞台，雾气还挂在屋檐上。",
      media: [media.kiyomizu, media.gion],
      createdAt: "2026-04-10T09:20:00.000Z",
      updatedAt: "2026-04-10T09:20:00.000Z",
    },
    {
      id: "journal-stop-gion",
      tripId: "sample-kyoto",
      dayId: "day-kyoto-1",
      stopId: "stop-gion",
      body: "巷子里的灯笼一盏盏亮起来。",
      media: [media.gion],
      createdAt: "2026-04-10T18:40:00.000Z",
      updatedAt: "2026-04-10T18:40:00.000Z",
    },
    {
      id: "journal-day2",
      tripId: "sample-kyoto",
      dayId: "day-kyoto-2",
      body: "千本鸟居与竹林，一天两条路径。",
      media: [media.fushimi, media.arashiyama],
      createdAt: "2026-04-11T16:10:00.000Z",
      updatedAt: "2026-04-11T16:10:00.000Z",
    },
  ];
}

/** Shared demo payload when Neon/API is offline (web + Expo screenshots). */
export function sampleKyotoFixture(): {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
  journal: JournalEntry[];
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

  return { trip, days, stops, legs, journal: sampleKyotoJournal() };
}

/** Soft-fail companions / comments / timeline when Neon+auth are unset. */
export function sampleKyotoCollab(): {
  members: TripMember[];
  yourRole: TripRole;
  comments: TripComment[];
  events: ActivityEvent[];
} {
  const tripId = "sample-kyoto";
  const members: TripMember[] = [
    {
      id: "member-demo",
      tripId,
      userId: "demo-user",
      role: "owner",
      displayName: "Demo Traveler",
      joinedAt: "2026-04-01T00:00:00.000Z",
    },
    {
      id: "member-mia",
      tripId,
      userId: "user-mia",
      role: "editor",
      displayName: "Mia Chen",
      joinedAt: "2026-04-02T08:00:00.000Z",
    },
    {
      id: "member-ken",
      tripId,
      userId: "user-ken",
      role: "viewer",
      displayName: "Ken Sato",
      joinedAt: "2026-04-03T10:30:00.000Z",
    },
  ];
  const names = members
    .map((m) => m.displayName)
    .filter((n): n is string => Boolean(n));

  const commentBodies: Array<{
    id: string;
    author: TripMember;
    body: string;
    stopId?: string;
    createdAt: string;
  }> = [
    {
      id: "comment-seed-1",
      author: members[1]!,
      body: "@Demo Traveler 清水寺清晨人少，建议八点前到。",
      stopId: "stop-kiyomizu",
      createdAt: "2026-04-09T12:10:00.000Z",
    },
    {
      id: "comment-seed-2",
      author: members[0]!,
      body: "@Mia Chen 收到 — 我会把路线钉在东山第一天。",
      createdAt: "2026-04-09T12:25:00.000Z",
    },
    {
      id: "comment-seed-3",
      author: members[2]!,
      body: "祇园傍晚灯笼很好拍，@Mia Chen 记得带相机。",
      stopId: "stop-gion",
      createdAt: "2026-04-09T18:40:00.000Z",
    },
  ];

  const comments: TripComment[] = commentBodies.map((c) => ({
    id: c.id,
    tripId,
    stopId: c.stopId,
    authorUserId: c.author.userId,
    authorDisplayName: c.author.displayName,
    body: c.body,
    mentions: parseMentions(c.body, names),
    createdAt: c.createdAt,
  }));

  const events: ActivityEvent[] = [
    {
      id: "activity-seed-1",
      tripId,
      type: "member_joined",
      actorUserId: members[0]!.userId,
      actorDisplayName: members[0]!.displayName,
      summary: "Demo Traveler opened the Kyoto sample trip",
      createdAt: "2026-04-01T00:00:00.000Z",
    },
    {
      id: "activity-seed-2",
      tripId,
      type: "invite_created",
      actorUserId: members[0]!.userId,
      actorDisplayName: members[0]!.displayName,
      summary: "Invite created for editors",
      createdAt: "2026-04-02T07:50:00.000Z",
    },
    {
      id: "activity-seed-3",
      tripId,
      type: "member_joined",
      actorUserId: members[1]!.userId,
      actorDisplayName: members[1]!.displayName,
      summary: "Mia Chen joined as editor",
      createdAt: "2026-04-02T08:00:00.000Z",
    },
    {
      id: "activity-seed-4",
      tripId,
      type: "stop_added",
      actorUserId: members[0]!.userId,
      actorDisplayName: members[0]!.displayName,
      summary: "Added 清水寺 to Day 1",
      payload: { stopId: "stop-kiyomizu" },
      createdAt: "2026-04-08T09:00:00.000Z",
    },
    {
      id: "activity-seed-5",
      tripId,
      type: "comment_added",
      actorUserId: members[1]!.userId,
      actorDisplayName: members[1]!.displayName,
      summary: "Mia Chen left a note on 清水寺",
      createdAt: "2026-04-09T12:10:00.000Z",
    },
    {
      id: "activity-seed-6",
      tripId,
      type: "day_fill_applied",
      actorUserId: members[0]!.userId,
      actorDisplayName: members[0]!.displayName,
      summary: "Day fill applied for temples + food",
      createdAt: "2026-04-09T15:00:00.000Z",
    },
  ];

  return {
    members,
    yourRole: "owner",
    comments,
    events,
  };
}
