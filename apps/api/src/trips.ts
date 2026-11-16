import { Hono } from "hono";
import {
  createEngineBundle,
  inferRegionHint,
  reorderStops,
  resolveMapEngine,
  routeAdjacentStops,
  sortStops,
  toPlaceRef,
  type CreateTripInput,
  type Day,
  type DuplicateTripInput,
  type JournalEntry,
  type MapEnginePreference,
  type PlaceSummary,
  type Stop,
  type Trip,
} from "@beaver/core";
import type { AuthVariables } from "./auth.js";
import { requireAuth } from "./auth.js";
import {
  applyVersionOrConflict,
  assertCanEdit,
  assertCanManage,
  assertCanView,
  parseExpectedVersion,
} from "./access.js";
import { dbOf } from "./db/context.js";
import type { Bindings } from "./env.js";
import {
  deleteTripCascade,
  getTrip,
  insertJournal,
  insertStop,
  insertTrip,
  listDays,
  listJournal,
  listLegs,
  listMembers,
  listStops,
  listTrips,
  nowIso,
  replaceDays,
  replaceLegs,
  replaceStops,
  updateTrip,
  upsertMember,
} from "./store.js";

export const tripRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

function preferenceFrom(
  raw: string | undefined | MapEnginePreference,
  fallback: string,
): MapEnginePreference {
  const v = String(raw ?? fallback ?? "auto").toLowerCase();
  if (v === "google" || v === "amap" || v === "auto") return v;
  return "auto";
}

tripRoutes.get("/v1/trips", async (c) => {
  const db = dbOf(c);
  const auth = c.get("auth");
  const all = await listTrips(db);
  const visible = [];
  for (const trip of all) {
    if (!auth) {
      if (trip.id === "sample-kyoto") visible.push(trip);
      continue;
    }
    const members = await listMembers(db, trip.id);
    if (
      members.length === 0 ||
      members.some((m) => m.userId === auth.userId) ||
      trip.id === "sample-kyoto"
    ) {
      visible.push(trip);
    }
  }
  return c.json({
    trips: visible,
    authMode: auth?.demo ? "demo" : auth ? "clerk" : "anonymous",
  });
});

tripRoutes.get("/v1/trips/:id", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  // Sample trip stays publicly readable for demos; other trips need membership when Clerk is on.
  if (trip.id !== "sample-kyoto") {
    const access = await assertCanView(c, trip.id);
    if (!access.ok) return access.res;
  }
  const days = await listDays(db, trip.id);
  const stops = sortStops(await listStops(db, trip.id));
  const legs = await listLegs(db, trip.id);
  const auth = c.get("auth");
  const members = await listMembers(db, trip.id);
  const yourRole =
    members.find((m) => m.userId === auth?.userId)?.role ??
    (trip.id === "sample-kyoto" ? "editor" : null);
  return c.json({
    trip,
    days,
    stops,
    legs,
    members,
    yourRole,
  });
});

tripRoutes.post("/v1/trips", requireAuth, async (c) => {
  let body: CreateTripInput;
  try {
    body = await c.req.json<CreateTripInput>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!body.title?.trim()) {
    return c.json({ error: "title_required" }, 400);
  }

  const db = dbOf(c);
  const auth = c.get("auth")!;
  const id = crypto.randomUUID();
  const stamp = nowIso();
  const trip: Trip = {
    id,
    title: body.title.trim(),
    destination: body.destination,
    startDate: body.startDate,
    endDate: body.endDate,
    timezone: body.timezone ?? "Asia/Shanghai",
    locale: body.locale ?? "zh-CN",
    mapEngine: "auto",
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await insertTrip(db, trip);
  await upsertMember(db, {
    id: crypto.randomUUID(),
    tripId: id,
    userId: auth.userId,
    role: "owner",
    displayName: auth.displayName,
    joinedAt: stamp,
  });

  return c.json({ trip, yourRole: "owner" as const }, 201);
});

tripRoutes.patch("/v1/trips/:id", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let body: Partial<
    Pick<Trip, "title" | "mapEngine" | "locale" | "destination">
  > & { expectedVersion?: number; version?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const bumped = await applyVersionOrConflict(
    c,
    trip,
    parseExpectedVersion(body),
  );
  if (!bumped.ok) return bumped.res;

  const next: Trip = {
    ...bumped.trip,
    title: body.title?.trim() || bumped.trip.title,
    destination: body.destination ?? bumped.trip.destination,
    locale: body.locale ?? bumped.trip.locale,
    mapEngine: body.mapEngine ?? bumped.trip.mapEngine,
  };
  await updateTrip(db, next);
  return c.json({ trip: next });
});

tripRoutes.delete("/v1/trips/:id", requireAuth, async (c) => {
  const db = dbOf(c);
  const id = c.req.param("id");
  const trip = await getTrip(db, id);
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanManage(c, id);
  if (!access.ok) return access.res;
  await deleteTripCascade(db, id);
  return c.json({ ok: true });
});

/**
 * Duplicate a trip the user can view.
 * Default: copy days + stops (no stop photos, no legs, no media).
 * Optional copyJournal: journal body text only (empty media[]).
 * New trip: fresh id/version; sole member = current user as owner.
 */
tripRoutes.post("/v1/trips/:id/duplicate", requireAuth, async (c) => {
  const db = dbOf(c);
  const source = await getTrip(db, c.req.param("id"));
  if (!source) return c.json({ error: "not_found" }, 404);
  // Sample stays readable; others need view access when Clerk is on.
  if (source.id !== "sample-kyoto") {
    const access = await assertCanView(c, source.id);
    if (!access.ok) return access.res;
  }

  let body: DuplicateTripInput = {};
  try {
    const text = await c.req.text();
    if (text.trim()) body = JSON.parse(text) as DuplicateTripInput;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const auth = c.get("auth")!;
  const stamp = nowIso();
  const copyJournal = Boolean(body.copyJournal);
  const locale = source.locale;
  const defaultTitle =
    locale === "en" ? `Copy of ${source.title}` : `副本 · ${source.title}`;
  const title = body.title?.trim() || defaultTitle;

  const tripId = crypto.randomUUID();
  const trip: Trip = {
    id: tripId,
    title,
    destination: source.destination,
    startDate: source.startDate,
    endDate: source.endDate,
    timezone: source.timezone,
    locale: source.locale,
    mapEngine: source.mapEngine,
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await insertTrip(db, trip);
  await upsertMember(db, {
    id: crypto.randomUUID(),
    tripId,
    userId: auth.userId,
    role: "owner",
    displayName: auth.displayName,
    joinedAt: stamp,
  });

  const sourceDays = await listDays(db, source.id);
  const dayIdMap = new Map<string, string>();
  const days: Day[] = sourceDays.map((d) => {
    const id = crypto.randomUUID();
    dayIdMap.set(d.id, id);
    return {
      id,
      tripId,
      date: d.date,
      note: d.note,
    };
  });
  await replaceDays(db, tripId, days);

  const sourceStops = sortStops(await listStops(db, source.id));
  const stopIdMap = new Map<string, string>();
  const stops: Stop[] = [];
  for (const s of sourceStops) {
    const newDayId = dayIdMap.get(s.dayId);
    if (!newDayId) continue;
    const id = crypto.randomUUID();
    stopIdMap.set(s.id, id);
    stops.push({
      id,
      dayId: newDayId,
      order: s.order,
      place: { ...s.place },
      userNote: s.userNote,
      photos: [],
    });
  }
  await replaceStops(db, tripId, stops);
  await replaceLegs(db, tripId, []);

  let journalCopied = 0;
  if (copyJournal) {
    const entries = await listJournal(db, source.id);
    for (const entry of entries) {
      const next: JournalEntry = {
        id: crypto.randomUUID(),
        tripId,
        dayId: entry.dayId ? dayIdMap.get(entry.dayId) : undefined,
        stopId: entry.stopId ? stopIdMap.get(entry.stopId) : undefined,
        body: entry.body,
        media: [],
        createdAt: stamp,
        updatedAt: stamp,
      };
      // Drop orphan day/stop refs if mapping missed.
      if (entry.dayId && !next.dayId) continue;
      if (entry.stopId && !next.stopId) continue;
      await insertJournal(db, next);
      journalCopied += 1;
    }
  }

  return c.json(
    {
      trip,
      days,
      stops,
      legs: [],
      yourRole: "owner" as const,
      copied: {
        days: days.length,
        stops: stops.length,
        journal: journalCopied,
        copyJournal,
      },
    },
    201,
  );
});

type AddStopBody = {
  dayId: string;
  place: PlaceSummary;
  engine?: "google" | "amap";
  userNote?: string;
};

tripRoutes.post("/v1/trips/:id/stops", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let body: AddStopBody & { expectedVersion?: number };
  try {
    body = await c.req.json<AddStopBody & { expectedVersion?: number }>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body.dayId || !body.place?.enginePlaceId) {
    return c.json({ error: "day_and_place_required" }, 400);
  }
  const days = await listDays(db, trip.id);
  if (!days.some((d) => d.id === body.dayId)) {
    return c.json({ error: "day_not_found" }, 404);
  }

  const bumped = await applyVersionOrConflict(
    c,
    trip,
    parseExpectedVersion(body),
  );
  if (!bumped.ok) return bumped.res;

  const engine =
    body.engine ??
    resolveMapEngine(
      preferenceFrom(bumped.trip.mapEngine, c.env.DEFAULT_MAP_ENGINE),
      (c.env.MAP_AUTO_AMAP_CN ?? "true") !== "false"
        ? inferRegionHint({
            cfCountry: c.req.header("cf-ipcountry"),
            acceptLanguage: c.req.header("accept-language"),
            timezone: bumped.trip.timezone,
          })
        : "other",
    );

  const existing = await listStops(db, trip.id);
  const dayStops = existing.filter((s) => s.dayId === body.dayId);
  const stop: Stop = {
    id: crypto.randomUUID(),
    dayId: body.dayId,
    order: dayStops.length,
    place: toPlaceRef(engine, body.place),
    userNote: body.userNote,
    photos: [],
  };
  await insertStop(db, trip.id, stop);
  return c.json({ stop, tripVersion: bumped.trip.version }, 201);
});

tripRoutes.patch("/v1/trips/:id/stops/reorder", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let body: { dayId: string; orderedIds: string[]; expectedVersion?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body.dayId || !Array.isArray(body.orderedIds)) {
    return c.json({ error: "dayId_and_orderedIds_required" }, 400);
  }
  const bumped = await applyVersionOrConflict(
    c,
    trip,
    parseExpectedVersion(body),
  );
  if (!bumped.ok) return bumped.res;

  const existing = await listStops(db, trip.id);
  const next = reorderStops(existing, body.dayId, body.orderedIds);
  await replaceStops(db, trip.id, next);
  await replaceLegs(db, trip.id, []);
  return c.json({
    stops: sortStops(next),
    tripVersion: bumped.trip.version,
  });
});

tripRoutes.delete("/v1/trips/:id/stops/:stopId", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let expectedVersion: number | undefined;
  try {
    const body = await c.req.json<{ expectedVersion?: number }>();
    expectedVersion = body.expectedVersion;
  } catch {
    expectedVersion = undefined;
  }

  const stopId = c.req.param("stopId");
  const existing = await listStops(db, trip.id);
  if (!existing.some((s) => s.id === stopId)) {
    return c.json({ error: "stop_not_found" }, 404);
  }

  const bumped = await applyVersionOrConflict(c, trip, expectedVersion);
  if (!bumped.ok) return bumped.res;

  const removed = existing.find((s) => s.id === stopId)!;
  const filtered = existing.filter((s) => s.id !== stopId);
  const reindexed = filtered.map((s) =>
    s.dayId === removed.dayId
      ? {
          ...s,
          order:
            sortStops(filtered.filter((x) => x.dayId === removed.dayId)).findIndex(
              (x) => x.id === s.id,
            ),
        }
      : s,
  );
  await replaceStops(db, trip.id, reindexed);
  await replaceLegs(db, trip.id, []);
  return c.json({ ok: true, tripVersion: bumped.trip.version });
});

type RouteDayBody = {
  dayId: string;
  mode?: "walk" | "transit" | "drive";
  engine?: MapEnginePreference;
};

tripRoutes.post("/v1/trips/:id/route-day", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;
  let body: RouteDayBody;
  try {
    body = await c.req.json<RouteDayBody>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body.dayId) return c.json({ error: "dayId_required" }, 400);

  const preference = preferenceFrom(
    body.engine ?? trip.mapEngine,
    c.env.DEFAULT_MAP_ENGINE,
  );
  const region =
    (c.env.MAP_AUTO_AMAP_CN ?? "true") !== "false"
      ? inferRegionHint({
          cfCountry: c.req.header("cf-ipcountry"),
          acceptLanguage: c.req.header("accept-language"),
          timezone: trip.timezone,
        })
      : ("other" as const);
  const engineId = resolveMapEngine(preference, region);
  const bundle = createEngineBundle(engineId, {
    googleServerKey: c.env.GOOGLE_MAPS_SERVER_KEY,
    amapServerKey: c.env.AMAP_SERVER_KEY,
  });

  const dayStops = sortStops(
    (await listStops(db, trip.id)).filter((s) => s.dayId === body.dayId),
  );
  if (dayStops.length < 2) {
    return c.json({
      legs: [],
      engineId,
      mode: bundle.mode,
      message: "need_at_least_two_stops",
    });
  }

  try {
    const legs = await routeAdjacentStops(
      bundle.routing,
      dayStops,
      body.mode ?? "transit",
      trip.locale,
    );
    const otherLegs = (await listLegs(db, trip.id)).filter(
      (l) => !dayStops.some((s) => s.id === l.fromStopId),
    );
    const nextLegs = [...otherLegs, ...legs];
    await replaceLegs(db, trip.id, nextLegs);
    return c.json({ legs, engineId, mode: bundle.mode, region });
  } catch (err) {
    const message = err instanceof Error ? err.message : "route_failed";
    return c.json({ error: message, engineId, mode: bundle.mode }, 502);
  }
});
