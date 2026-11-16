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
import type { Bindings } from "./env.js";
import {
  daysByTrip,
  journalByTrip,
  legsByTrip,
  listMembers,
  nowIso,
  shareByTrip,
  stopsByTrip,
  trips,
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

tripRoutes.get("/v1/trips", (c) => {
  const auth = c.get("auth");
  const all = Array.from(trips.values());
  const visible = auth
    ? all.filter((trip) => {
        const members = listMembers(trip.id);
        return (
          members.length === 0 ||
          members.some((m) => m.userId === auth.userId) ||
          trip.id === "sample-kyoto"
        );
      })
    : all.filter((trip) => trip.id === "sample-kyoto");
  return c.json({
    trips: visible,
    authMode: auth?.demo ? "demo" : auth ? "clerk" : "anonymous",
  });
});

tripRoutes.get("/v1/trips/:id", (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  // Sample trip stays publicly readable for demos; other trips need membership when Clerk is on.
  if (trip.id !== "sample-kyoto") {
    const access = assertCanView(c, trip.id);
    if (!access.ok) return access.res;
  }
  const days = daysByTrip.get(trip.id) ?? [];
  const stops = sortStops(stopsByTrip.get(trip.id) ?? []);
  const legs = legsByTrip.get(trip.id) ?? [];
  const auth = c.get("auth");
  const members = listMembers(trip.id);
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
  trips.set(id, trip);
  daysByTrip.set(id, []);
  stopsByTrip.set(id, []);
  legsByTrip.set(id, []);
  journalByTrip.set(id, []);
  shareByTrip.set(id, []);
  upsertMember({
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
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let body: Partial<
    Pick<Trip, "title" | "mapEngine" | "locale" | "destination">
  > & { expectedVersion?: number; version?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const bumped = applyVersionOrConflict(
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
  trips.set(trip.id, next);
  return c.json({ trip: next });
});

tripRoutes.delete("/v1/trips/:id", requireAuth, (c) => {
  const id = c.req.param("id");
  if (!trips.has(id)) return c.json({ error: "not_found" }, 404);
  const access = assertCanManage(c, id);
  if (!access.ok) return access.res;
  trips.delete(id);
  daysByTrip.delete(id);
  stopsByTrip.delete(id);
  legsByTrip.delete(id);
  journalByTrip.delete(id);
  shareByTrip.delete(id);
  return c.json({ ok: true });
});

type AddStopBody = {
  dayId: string;
  place: PlaceSummary;
  engine?: "google" | "amap";
  userNote?: string;
};

tripRoutes.post("/v1/trips/:id/stops", requireAuth, async (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanEdit(c, trip.id);
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
  const days = daysByTrip.get(trip.id) ?? [];
  if (!days.some((d) => d.id === body.dayId)) {
    return c.json({ error: "day_not_found" }, 404);
  }

  const bumped = applyVersionOrConflict(
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

  const existing = stopsByTrip.get(trip.id) ?? [];
  const dayStops = existing.filter((s) => s.dayId === body.dayId);
  const stop: Stop = {
    id: crypto.randomUUID(),
    dayId: body.dayId,
    order: dayStops.length,
    place: toPlaceRef(engine, body.place),
    userNote: body.userNote,
    photos: [],
  };
  stopsByTrip.set(trip.id, [...existing, stop]);
  return c.json({ stop, tripVersion: bumped.trip.version }, 201);
});

tripRoutes.patch("/v1/trips/:id/stops/reorder", requireAuth, async (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanEdit(c, trip.id);
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
  const bumped = applyVersionOrConflict(
    c,
    trip,
    parseExpectedVersion(body),
  );
  if (!bumped.ok) return bumped.res;

  const existing = stopsByTrip.get(trip.id) ?? [];
  const next = reorderStops(existing, body.dayId, body.orderedIds);
  stopsByTrip.set(trip.id, next);
  legsByTrip.set(trip.id, []);
  return c.json({
    stops: sortStops(next),
    tripVersion: bumped.trip.version,
  });
});

tripRoutes.delete("/v1/trips/:id/stops/:stopId", requireAuth, async (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let expectedVersion: number | undefined;
  try {
    const body = await c.req.json<{ expectedVersion?: number }>();
    expectedVersion = body.expectedVersion;
  } catch {
    expectedVersion = undefined;
  }

  const stopId = c.req.param("stopId");
  const existing = stopsByTrip.get(trip.id) ?? [];
  if (!existing.some((s) => s.id === stopId)) {
    return c.json({ error: "stop_not_found" }, 404);
  }

  const bumped = applyVersionOrConflict(c, trip, expectedVersion);
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
  stopsByTrip.set(trip.id, reindexed);
  legsByTrip.set(trip.id, []);
  return c.json({ ok: true, tripVersion: bumped.trip.version });
});

type RouteDayBody = {
  dayId: string;
  mode?: "walk" | "transit" | "drive";
  engine?: MapEnginePreference;
};

tripRoutes.post("/v1/trips/:id/route-day", requireAuth, async (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanEdit(c, trip.id);
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
    (stopsByTrip.get(trip.id) ?? []).filter((s) => s.dayId === body.dayId),
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
    const otherLegs = (legsByTrip.get(trip.id) ?? []).filter(
      (l) => !dayStops.some((s) => s.id === l.fromStopId),
    );
    const nextLegs = [...otherLegs, ...legs];
    legsByTrip.set(trip.id, nextLegs);
    return c.json({ legs, engineId, mode: bundle.mode, region });
  } catch (err) {
    const message = err instanceof Error ? err.message : "route_failed";
    return c.json({ error: message, engineId, mode: bundle.mode }, 502);
  }
});
