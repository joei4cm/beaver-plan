import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type {
  ActivityEvent,
  ActivityEventType,
  Day,
  JournalEntry,
  Leg,
  PlaceRef,
  ShareArtifact,
  Stop,
  Trip,
  TripComment,
  TripInvite,
  TripMember,
  TripRole,
} from "@beaver/core";
import {
  DEMO_PLACES,
  buildDemoTransitRoute,
  buildDemoWalkOrDrive,
  polylineLooksLikeChord,
} from "@beaver/core";
import type { Db } from "./db/client.js";
import {
  days as daysTable,
  journalEntries as journalTable,
  legs as legsTable,
  shareArtifacts as shareTable,
  stops as stopsTable,
  tripActivityEvents as activityTable,
  tripComments as commentsTable,
  tripInvites as invitesTable,
  tripMembers as membersTable,
  trips as tripsTable,
} from "./db/schema.js";
import type { Bindings } from "./env.js";
import {
  makePlaceholderSvg,
  mediaObjectKey,
  putMediaObject,
} from "./media-store.js";
import { isS3Configured, requireS3Config, type S3Config } from "./s3.js";

export function nowIso() {
  return new Date().toISOString();
}

/* ── mappers ───────────────────────────────────────────────────────────── */

function rowToTrip(row: typeof tripsTable.$inferSelect): Trip {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination ?? undefined,
    startDate: row.startDate ?? undefined,
    endDate: row.endDate ?? undefined,
    timezone: row.timezone,
    locale: row.locale as Trip["locale"],
    mapEngine: row.mapEngine as Trip["mapEngine"],
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToDay(row: typeof daysTable.$inferSelect): Day {
  return {
    id: row.id,
    tripId: row.tripId,
    date: row.date,
    note: row.note ?? undefined,
  };
}

function rowToStop(row: typeof stopsTable.$inferSelect): Stop {
  const place: PlaceRef = {
    engine: row.placeEngine as PlaceRef["engine"],
    enginePlaceId: row.placeEnginePlaceId,
    name: row.placeName,
    address: row.placeAddress ?? undefined,
    lat: row.placeLat,
    lng: row.placeLng,
    raw: row.placeRaw ?? undefined,
  };
  return {
    id: row.id,
    dayId: row.dayId,
    order: row.order,
    place,
    userNote: row.userNote ?? undefined,
    photos: row.photos ?? [],
    bookingLinks: row.bookingLinks ?? [],
  };
}

function stopValues(tripId: string, stop: Stop) {
  return {
    id: stop.id,
    tripId,
    dayId: stop.dayId,
    order: stop.order,
    placeEngine: stop.place.engine,
    placeEnginePlaceId: stop.place.enginePlaceId,
    placeName: stop.place.name,
    placeAddress: stop.place.address ?? null,
    placeLat: stop.place.lat,
    placeLng: stop.place.lng,
    placeRaw: stop.place.raw ?? null,
    userNote: stop.userNote ?? null,
    photos: stop.photos ?? [],
    bookingLinks: stop.bookingLinks ?? [],
  };
}

function rowToLeg(row: typeof legsTable.$inferSelect): Leg {
  return {
    id: row.id,
    fromStopId: row.fromStopId,
    toStopId: row.toStopId,
    mode: row.mode as Leg["mode"],
    durationSec: row.durationSec,
    distanceM: row.distanceM,
    polyline: row.polyline ?? undefined,
    transitSteps: row.transitSteps ?? [],
  };
}

function legValues(tripId: string, leg: Leg) {
  return {
    id: leg.id,
    tripId,
    fromStopId: leg.fromStopId,
    toStopId: leg.toStopId,
    mode: leg.mode,
    durationSec: leg.durationSec,
    distanceM: leg.distanceM,
    polyline: leg.polyline ?? null,
    transitSteps: leg.transitSteps ?? [],
  };
}

function rowToJournal(row: typeof journalTable.$inferSelect): JournalEntry {
  return {
    id: row.id,
    tripId: row.tripId,
    dayId: row.dayId ?? undefined,
    stopId: row.stopId ?? undefined,
    body: row.body,
    media: row.media ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToShare(row: typeof shareTable.$inferSelect): ShareArtifact {
  return {
    id: row.id,
    tripId: row.tripId,
    templateId: row.templateId as ShareArtifact["templateId"],
    dayId: row.dayId ?? undefined,
    width: row.width,
    height: row.height,
    storageUrl: row.storageUrl ?? undefined,
    createdAt: row.createdAt,
  };
}

function rowToMember(row: typeof membersTable.$inferSelect): TripMember {
  return {
    id: row.id,
    tripId: row.tripId,
    userId: row.userId,
    role: row.role as TripRole,
    displayName: row.displayName ?? undefined,
    joinedAt: row.joinedAt,
  };
}

function rowToInvite(row: typeof invitesTable.$inferSelect): TripInvite {
  return {
    id: row.id,
    tripId: row.tripId,
    code: row.code,
    role: row.role as TripInvite["role"],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
    maxUses: row.maxUses ?? undefined,
    useCount: row.useCount,
  };
}

function rowToComment(row: typeof commentsTable.$inferSelect): TripComment {
  return {
    id: row.id,
    tripId: row.tripId,
    stopId: row.stopId ?? undefined,
    authorUserId: row.authorUserId,
    authorDisplayName: row.authorDisplayName ?? undefined,
    body: row.body,
    mentions: row.mentions ?? [],
    createdAt: row.createdAt,
  };
}

function rowToActivity(row: typeof activityTable.$inferSelect): ActivityEvent {
  return {
    id: row.id,
    tripId: row.tripId,
    type: row.type as ActivityEventType,
    actorUserId: row.actorUserId,
    actorDisplayName: row.actorDisplayName ?? undefined,
    summary: row.summary,
    payload: row.payload ?? undefined,
    createdAt: row.createdAt,
  };
}

/* ── trips ─────────────────────────────────────────────────────────────── */

export async function listTrips(db: Db): Promise<Trip[]> {
  const rows = await db.select().from(tripsTable).orderBy(asc(tripsTable.createdAt));
  return rows.map(rowToTrip);
}

export async function getTrip(db: Db, id: string): Promise<Trip | null> {
  const rows = await db.select().from(tripsTable).where(eq(tripsTable.id, id)).limit(1);
  return rows[0] ? rowToTrip(rows[0]) : null;
}

export async function insertTrip(db: Db, trip: Trip): Promise<Trip> {
  await db.insert(tripsTable).values({
    id: trip.id,
    title: trip.title,
    destination: trip.destination ?? null,
    startDate: trip.startDate ?? null,
    endDate: trip.endDate ?? null,
    timezone: trip.timezone,
    locale: trip.locale,
    mapEngine: trip.mapEngine,
    version: trip.version,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  });
  return trip;
}

export async function updateTrip(db: Db, trip: Trip): Promise<Trip> {
  await db
    .update(tripsTable)
    .set({
      title: trip.title,
      destination: trip.destination ?? null,
      startDate: trip.startDate ?? null,
      endDate: trip.endDate ?? null,
      timezone: trip.timezone,
      locale: trip.locale,
      mapEngine: trip.mapEngine,
      version: trip.version,
      updatedAt: trip.updatedAt,
    })
    .where(eq(tripsTable.id, trip.id));
  return trip;
}

export async function deleteTripCascade(db: Db, tripId: string): Promise<void> {
  // FKs cascade, but delete children first for neon-http clarity.
  await db.delete(shareTable).where(eq(shareTable.tripId, tripId));
  await db.delete(journalTable).where(eq(journalTable.tripId, tripId));
  await db.delete(legsTable).where(eq(legsTable.tripId, tripId));
  await db.delete(stopsTable).where(eq(stopsTable.tripId, tripId));
  await db.delete(daysTable).where(eq(daysTable.tripId, tripId));
  await db.delete(invitesTable).where(eq(invitesTable.tripId, tripId));
  await db.delete(membersTable).where(eq(membersTable.tripId, tripId));
  await db.delete(tripsTable).where(eq(tripsTable.id, tripId));
}

/* ── days / stops / legs ───────────────────────────────────────────────── */

export async function listDays(db: Db, tripId: string): Promise<Day[]> {
  const rows = await db
    .select()
    .from(daysTable)
    .where(eq(daysTable.tripId, tripId))
    .orderBy(asc(daysTable.date));
  return rows.map(rowToDay);
}

export async function replaceDays(db: Db, tripId: string, days: Day[]): Promise<void> {
  await db.delete(daysTable).where(eq(daysTable.tripId, tripId));
  if (days.length === 0) return;
  await db.insert(daysTable).values(
    days.map((d) => ({
      id: d.id,
      tripId,
      date: d.date,
      note: d.note ?? null,
    })),
  );
}

export async function listStops(db: Db, tripId: string): Promise<Stop[]> {
  const rows = await db
    .select()
    .from(stopsTable)
    .where(eq(stopsTable.tripId, tripId))
    .orderBy(asc(stopsTable.order));
  return rows.map(rowToStop);
}

export async function insertStop(db: Db, tripId: string, stop: Stop): Promise<Stop> {
  await db.insert(stopsTable).values(stopValues(tripId, stop));
  return stop;
}

export async function replaceStops(db: Db, tripId: string, stops: Stop[]): Promise<void> {
  await db.delete(stopsTable).where(eq(stopsTable.tripId, tripId));
  if (stops.length === 0) return;
  await db.insert(stopsTable).values(stops.map((s) => stopValues(tripId, s)));
}

export async function listLegs(db: Db, tripId: string): Promise<Leg[]> {
  const rows = await db.select().from(legsTable).where(eq(legsTable.tripId, tripId));
  return rows.map(rowToLeg);
}

export async function replaceLegs(db: Db, tripId: string, legs: Leg[]): Promise<void> {
  await db.delete(legsTable).where(eq(legsTable.tripId, tripId));
  if (legs.length === 0) return;
  await db.insert(legsTable).values(legs.map((l) => legValues(tripId, l)));
}

/* ── journal / share ───────────────────────────────────────────────────── */

export async function listJournal(db: Db, tripId: string): Promise<JournalEntry[]> {
  const rows = await db
    .select()
    .from(journalTable)
    .where(eq(journalTable.tripId, tripId))
    .orderBy(asc(journalTable.createdAt));
  return rows.map(rowToJournal);
}

export async function insertJournal(
  db: Db,
  entry: JournalEntry,
): Promise<JournalEntry> {
  await db.insert(journalTable).values({
    id: entry.id,
    tripId: entry.tripId,
    dayId: entry.dayId ?? null,
    stopId: entry.stopId ?? null,
    body: entry.body,
    media: entry.media ?? [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
  return entry;
}

export async function updateJournal(
  db: Db,
  entry: JournalEntry,
): Promise<JournalEntry> {
  await db
    .update(journalTable)
    .set({
      dayId: entry.dayId ?? null,
      stopId: entry.stopId ?? null,
      body: entry.body,
      media: entry.media ?? [],
      updatedAt: entry.updatedAt,
    })
    .where(eq(journalTable.id, entry.id));
  return entry;
}

export async function deleteJournal(
  db: Db,
  tripId: string,
  entryId: string,
): Promise<void> {
  await db
    .delete(journalTable)
    .where(and(eq(journalTable.tripId, tripId), eq(journalTable.id, entryId)));
}

export async function listShare(db: Db, tripId: string): Promise<ShareArtifact[]> {
  const rows = await db
    .select()
    .from(shareTable)
    .where(eq(shareTable.tripId, tripId))
    .orderBy(desc(shareTable.createdAt));
  return rows.map(rowToShare);
}

export async function insertShare(
  db: Db,
  artifact: ShareArtifact,
): Promise<ShareArtifact> {
  await db.insert(shareTable).values({
    id: artifact.id,
    tripId: artifact.tripId,
    templateId: artifact.templateId,
    dayId: artifact.dayId ?? null,
    width: artifact.width,
    height: artifact.height,
    storageUrl: artifact.storageUrl ?? null,
    createdAt: artifact.createdAt,
  });
  // Cap history at 20 like the in-memory store.
  const all = await listShare(db, artifact.tripId);
  if (all.length > 20) {
    const dropIds = all.slice(20).map((a) => a.id);
    await db.delete(shareTable).where(inArray(shareTable.id, dropIds));
  }
  return artifact;
}

/* ── members / invites ─────────────────────────────────────────────────── */

export async function listMembers(db: Db, tripId: string): Promise<TripMember[]> {
  const rows = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.tripId, tripId))
    .orderBy(asc(membersTable.joinedAt));
  return rows.map(rowToMember);
}

export async function upsertMember(db: Db, member: TripMember): Promise<TripMember> {
  const existing = await db
    .select()
    .from(membersTable)
    .where(
      and(
        eq(membersTable.tripId, member.tripId),
        eq(membersTable.userId, member.userId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(membersTable)
      .set({
        role: member.role,
        displayName: member.displayName ?? null,
      })
      .where(eq(membersTable.id, existing[0].id));
    return {
      ...member,
      id: existing[0].id,
      joinedAt: existing[0].joinedAt,
    };
  }

  await db.insert(membersTable).values({
    id: member.id,
    tripId: member.tripId,
    userId: member.userId,
    role: member.role,
    displayName: member.displayName ?? null,
    joinedAt: member.joinedAt,
  });
  return member;
}

export async function removeMember(
  db: Db,
  tripId: string,
  userId: string,
): Promise<boolean> {
  const before = await listMembers(db, tripId);
  if (!before.some((m) => m.userId === userId)) return false;
  await db
    .delete(membersTable)
    .where(and(eq(membersTable.tripId, tripId), eq(membersTable.userId, userId)));
  return true;
}

export async function getInviteByCode(
  db: Db,
  code: string,
): Promise<TripInvite | null> {
  const rows = await db
    .select()
    .from(invitesTable)
    .where(eq(invitesTable.code, code.toUpperCase()))
    .limit(1);
  return rows[0] ? rowToInvite(rows[0]) : null;
}

export async function listInvites(db: Db, tripId: string): Promise<TripInvite[]> {
  const rows = await db
    .select()
    .from(invitesTable)
    .where(eq(invitesTable.tripId, tripId))
    .orderBy(desc(invitesTable.createdAt));
  return rows.map(rowToInvite);
}

export async function saveInvite(db: Db, invite: TripInvite): Promise<TripInvite> {
  const existing = await db
    .select()
    .from(invitesTable)
    .where(eq(invitesTable.id, invite.id))
    .limit(1);

  const values = {
    id: invite.id,
    tripId: invite.tripId,
    code: invite.code.toUpperCase(),
    role: invite.role,
    createdBy: invite.createdBy,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt ?? null,
    revokedAt: invite.revokedAt ?? null,
    maxUses: invite.maxUses ?? null,
    useCount: invite.useCount,
  };

  if (existing[0]) {
    await db.update(invitesTable).set(values).where(eq(invitesTable.id, invite.id));
  } else {
    await db.insert(invitesTable).values(values);
  }
  return { ...invite, code: values.code };
}

export async function inviteCodeExists(db: Db, code: string): Promise<boolean> {
  const found = await getInviteByCode(db, code);
  return Boolean(found);
}

/* ── comments / activity ───────────────────────────────────────────────── */

export async function listComments(
  db: Db,
  tripId: string,
  stopId?: string,
): Promise<TripComment[]> {
  const rows = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.tripId, tripId))
    .orderBy(asc(commentsTable.createdAt));
  const all = rows.map(rowToComment);
  if (!stopId) return all;
  return all.filter((c) => c.stopId === stopId);
}

export async function insertComment(
  db: Db,
  comment: TripComment,
): Promise<TripComment> {
  await db.insert(commentsTable).values({
    id: comment.id,
    tripId: comment.tripId,
    stopId: comment.stopId ?? null,
    authorUserId: comment.authorUserId,
    authorDisplayName: comment.authorDisplayName ?? null,
    body: comment.body,
    mentions: comment.mentions ?? [],
    createdAt: comment.createdAt,
  });
  return comment;
}

export async function listActivity(
  db: Db,
  tripId: string,
  limit = 50,
): Promise<ActivityEvent[]> {
  const capped = Math.max(1, Math.min(100, limit));
  const rows = await db
    .select()
    .from(activityTable)
    .where(eq(activityTable.tripId, tripId))
    .orderBy(desc(activityTable.createdAt))
    .limit(capped);
  return rows.map(rowToActivity);
}

export async function appendActivity(
  db: Db,
  event: ActivityEvent,
): Promise<ActivityEvent> {
  await db.insert(activityTable).values({
    id: event.id,
    tripId: event.tripId,
    type: event.type,
    actorUserId: event.actorUserId,
    actorDisplayName: event.actorDisplayName ?? null,
    summary: event.summary,
    payload: event.payload ?? null,
    createdAt: event.createdAt,
  });
  return event;
}

export function makeActivityEvent(input: {
  tripId: string;
  type: ActivityEventType;
  actorUserId: string;
  actorDisplayName?: string;
  summary: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
}): ActivityEvent {
  return {
    id: crypto.randomUUID(),
    tripId: input.tripId,
    type: input.type,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    summary: input.summary,
    payload: input.payload,
    createdAt: input.createdAt ?? nowIso(),
  };
}

/* ── sample seed ───────────────────────────────────────────────────────── */

/** Seed Kyoto demo trip (idempotent). Demo photo bytes go to S3 when configured. */
export async function ensureSampleTrip(
  db: Db,
  env?: Bindings,
): Promise<void> {
  const id = "sample-kyoto";
  const s3 = env && isS3Configured(env) ? requireS3Config(env) : null;
  const existing = await getTrip(db, id);
  if (existing) {
    // Re-upload demo placeholders so signed URLs work after bucket wipe / new env.
    if (s3) await seedSampleMedia(s3);
    // Soft upgrade: empty / chord-only legs → road-following Kyoto demo geometry.
    const legs = await listLegs(db, id);
    const stops = await listStops(db, id);
    const needsRoadGeometry =
      stops.length >= 2 &&
      (legs.length === 0 ||
        legs.some(
          (leg) =>
            polylineLooksLikeChord(leg.polyline) ||
            leg.transitSteps.some((s) => polylineLooksLikeChord(s.polyline)),
        ));
    if (needsRoadGeometry) {
      await replaceLegs(db, id, buildSampleKyotoLegs(stops));
    }
    await seedSampleCollabIfEmpty(db, id);
    return;
  }

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
  await insertTrip(db, trip);

  await upsertMember(db, {
    id: "member-kyoto-owner",
    tripId: id,
    userId: "demo-user",
    role: "owner",
    displayName: "Demo Traveler",
    joinedAt: stamp,
  });
  await upsertMember(db, {
    id: "member-kyoto-viewer",
    tripId: id,
    userId: "demo-viewer",
    role: "viewer",
    displayName: "Companion",
    joinedAt: stamp,
  });

  const days: Day[] = [
    { id: "day-kyoto-1", tripId: id, date: "2026-04-10", note: "东山 · 清水寺一带" },
    { id: "day-kyoto-2", tripId: id, date: "2026-04-11", note: "伏见 · 岚山" },
    { id: "day-kyoto-3", tripId: id, date: "2026-04-12", note: "市中心市场" },
  ];
  await replaceDays(db, id, days);

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
      bookingLinks: [
        {
          kind: "ticket",
          url: "https://example.com/demo/tickets/kiyomizu-night",
          providerLabel: "DemoTickets",
        },
      ],
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
      bookingLinks: [
        {
          kind: "hotel",
          url: "https://example.com/demo/hotels/higashiyama-ryokan",
          providerLabel: "DemoStay",
        },
      ],
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
  await replaceStops(db, id, stops);
  await replaceLegs(db, id, buildSampleKyotoLegs(stops));

  // Object keys stored in Neon; bytes uploaded when S3 is configured.
  const mediaKeys = {
    kiyomizu: mediaObjectKey("demo-photo-kiyomizu"),
    gion: mediaObjectKey("demo-photo-gion"),
    fushimi: mediaObjectKey("demo-photo-fushimi"),
    arashiyama: mediaObjectKey("demo-photo-arashiyama"),
  };
  if (s3) await seedSampleMedia(s3);

  const journal: JournalEntry[] = [
    {
      id: "journal-day1",
      tripId: id,
      dayId: "day-kyoto-1",
      body: "清晨爬上清水舞台，雾气还挂在屋檐上。",
      media: [mediaKeys.kiyomizu, mediaKeys.gion],
      createdAt: "2026-04-10T09:20:00.000Z",
      updatedAt: "2026-04-10T09:20:00.000Z",
    },
    {
      id: "journal-stop-gion",
      tripId: id,
      dayId: "day-kyoto-1",
      stopId: "stop-gion",
      body: "巷子里的灯笼一盏盏亮起来。",
      media: [mediaKeys.gion],
      createdAt: "2026-04-10T18:40:00.000Z",
      updatedAt: "2026-04-10T18:40:00.000Z",
    },
    {
      id: "journal-day2",
      tripId: id,
      dayId: "day-kyoto-2",
      body: "千本鸟居与竹林，一天两条路径。",
      media: [mediaKeys.fushimi, mediaKeys.arashiyama],
      createdAt: "2026-04-11T16:10:00.000Z",
      updatedAt: "2026-04-11T16:10:00.000Z",
    },
  ];
  for (const entry of journal) {
    await insertJournal(db, entry);
  }

  await seedSampleCollabIfEmpty(db, id);
}

/** Seed demo comments + activity once (idempotent when already present). */
async function seedSampleCollabIfEmpty(db: Db, tripId: string): Promise<void> {
  const existingComments = await listComments(db, tripId);
  const existingActivity = await listActivity(db, tripId, 5);
  if (existingComments.length > 0 || existingActivity.length > 0) return;

  const stamp = "2026-04-09T08:00:00.000Z";
  await appendActivity(
    db,
    makeActivityEvent({
      tripId,
      type: "member_joined",
      actorUserId: "demo-user",
      actorDisplayName: "Demo Traveler",
      summary: "Demo Traveler joined as owner",
      payload: { role: "owner" },
      createdAt: stamp,
    }),
  );
  await appendActivity(
    db,
    makeActivityEvent({
      tripId,
      type: "member_joined",
      actorUserId: "demo-viewer",
      actorDisplayName: "Companion",
      summary: "Companion joined as viewer",
      payload: { role: "viewer" },
      createdAt: "2026-04-09T08:05:00.000Z",
    }),
  );
  await appendActivity(
    db,
    makeActivityEvent({
      tripId,
      type: "stop_added",
      actorUserId: "demo-user",
      actorDisplayName: "Demo Traveler",
      summary: "Added 清水寺",
      payload: { stopId: "stop-kiyomizu", placeName: "清水寺" },
      createdAt: "2026-04-09T09:00:00.000Z",
    }),
  );

  const comment: TripComment = {
    id: "comment-kyoto-1",
    tripId,
    stopId: "stop-kiyomizu",
    authorUserId: "demo-user",
    authorDisplayName: "Demo Traveler",
    body: "@Companion morning visit — arrive before the crowds at 清水寺?",
    mentions: ["Companion"],
    createdAt: "2026-04-09T10:15:00.000Z",
  };
  await insertComment(db, comment);
  await appendActivity(
    db,
    makeActivityEvent({
      tripId,
      type: "comment_added",
      actorUserId: comment.authorUserId,
      actorDisplayName: comment.authorDisplayName,
      summary: "Demo Traveler commented on 清水寺",
      payload: { commentId: comment.id, stopId: comment.stopId },
      createdAt: comment.createdAt,
    }),
  );
}

/** Multi-step transit demo legs for sample-kyoto (works without map keys). */
function buildSampleKyotoLegs(stops: Stop[]): Leg[] {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const pairs: Array<[string, string, "transit" | "walk"]> = [
    ["stop-kiyomizu", "stop-gion", "transit"],
    ["stop-fushimi", "stop-arashiyama", "transit"],
  ];
  const legs: Leg[] = [];
  for (const [fromId, toId, mode] of pairs) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) continue;
    const origin = { lat: from.place.lat, lng: from.place.lng };
    const dest = { lat: to.place.lat, lng: to.place.lng };
    const result =
      mode === "transit"
        ? buildDemoTransitRoute(origin, dest, "zh-CN")
        : buildDemoWalkOrDrive(origin, dest, "walk", true);
    legs.push({
      id: `leg-${fromId}-${toId}`,
      fromStopId: fromId,
      toStopId: toId,
      mode,
      durationSec: result.durationSec,
      distanceM: result.distanceM,
      polyline: result.polyline,
      transitSteps: result.transitSteps,
    });
  }
  return legs;
}

/** Upload Kyoto placeholder SVGs to S3 (idempotent overwrite). */
async function seedSampleMedia(cfg: S3Config): Promise<void> {
  const specs = [
    {
      id: "demo-photo-kiyomizu",
      title: "清水寺",
      subtitle: "East Kyoto · morning mist",
      tone: "river" as const,
    },
    {
      id: "demo-photo-gion",
      title: "祇园",
      subtitle: "Lantern lanes",
      tone: "mist" as const,
    },
    {
      id: "demo-photo-fushimi",
      title: "伏见稻荷",
      subtitle: "Torii path",
      tone: "sky" as const,
    },
    {
      id: "demo-photo-arashiyama",
      title: "岚山",
      subtitle: "Bamboo light",
      tone: "river" as const,
    },
  ];
  for (const spec of specs) {
    await putMediaObject(cfg, {
      id: spec.id,
      bytes: makePlaceholderSvg({
        title: spec.title,
        subtitle: spec.subtitle,
        tone: spec.tone,
      }),
      contentType: "image/svg+xml",
      tripId: "sample-kyoto",
    });
  }
}
