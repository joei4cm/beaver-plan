import { Hono } from "hono";
import type {
  CreateJournalInput,
  JournalEntry,
  UpdateJournalInput,
} from "@beaver/core";
import type { AuthVariables } from "./auth.js";
import { requireAuth } from "./auth.js";
import { applyVersionOrConflict, assertCanEdit } from "./access.js";
import { dbOf } from "./db/context.js";
import type { Bindings } from "./env.js";
import {
  deleteJournal,
  getTrip,
  insertJournal,
  listDays,
  listJournal,
  listStops,
  nowIso,
  updateJournal,
} from "./store.js";

export const journalRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

journalRoutes.get("/v1/trips/:id/journal", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const dayId = c.req.query("dayId");
  const stopId = c.req.query("stopId");
  let entries = await listJournal(db, trip.id);
  if (dayId) entries = entries.filter((e) => e.dayId === dayId);
  if (stopId) entries = entries.filter((e) => e.stopId === stopId);
  entries = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return c.json({ entries });
});

journalRoutes.post("/v1/trips/:id/journal", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let body: CreateJournalInput & { expectedVersion?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body.body?.trim() && !(body.media && body.media.length > 0)) {
    return c.json({ error: "body_or_media_required" }, 400);
  }
  if (body.dayId) {
    const days = await listDays(db, trip.id);
    if (!days.some((d) => d.id === body.dayId)) {
      return c.json({ error: "day_not_found" }, 404);
    }
  }
  if (body.stopId) {
    const stops = await listStops(db, trip.id);
    if (!stops.some((s) => s.id === body.stopId)) {
      return c.json({ error: "stop_not_found" }, 404);
    }
  }

  const bumped = await applyVersionOrConflict(c, trip, body.expectedVersion);
  if (!bumped.ok) return bumped.res;

  const stamp = bumped.trip.updatedAt;
  const entry: JournalEntry = {
    id: crypto.randomUUID(),
    tripId: trip.id,
    dayId: body.dayId,
    stopId: body.stopId,
    body: (body.body ?? "").trim(),
    media: body.media ?? [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  await insertJournal(db, entry);
  return c.json({ entry, tripVersion: bumped.trip.version }, 201);
});

journalRoutes.patch("/v1/trips/:id/journal/:entryId", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  const entryId = c.req.param("entryId");
  const list = await listJournal(db, trip.id);
  const idx = list.findIndex((e) => e.id === entryId);
  if (idx < 0) return c.json({ error: "entry_not_found" }, 404);

  let body: UpdateJournalInput & { expectedVersion?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const bumped = await applyVersionOrConflict(c, trip, body.expectedVersion);
  if (!bumped.ok) return bumped.res;

  const prev = list[idx]!;
  const next: JournalEntry = {
    ...prev,
    body: body.body !== undefined ? body.body.trim() : prev.body,
    media: body.media ?? prev.media,
    dayId:
      body.dayId === null
        ? undefined
        : body.dayId !== undefined
          ? body.dayId
          : prev.dayId,
    stopId:
      body.stopId === null
        ? undefined
        : body.stopId !== undefined
          ? body.stopId
          : prev.stopId,
    updatedAt: nowIso(),
  };
  await updateJournal(db, next);
  return c.json({ entry: next, tripVersion: bumped.trip.version });
});

journalRoutes.delete(
  "/v1/trips/:id/journal/:entryId",
  requireAuth,
  async (c) => {
    const db = dbOf(c);
    const trip = await getTrip(db, c.req.param("id"));
    if (!trip) return c.json({ error: "not_found" }, 404);
    const access = await assertCanEdit(c, trip.id);
    if (!access.ok) return access.res;

    const entryId = c.req.param("entryId");
    const list = await listJournal(db, trip.id);
    if (!list.some((e) => e.id === entryId)) {
      return c.json({ error: "entry_not_found" }, 404);
    }

    let expectedVersion: number | undefined;
    try {
      const body = await c.req.json<{ expectedVersion?: number }>();
      expectedVersion = body.expectedVersion;
    } catch {
      expectedVersion = undefined;
    }

    const bumped = await applyVersionOrConflict(c, trip, expectedVersion);
    if (!bumped.ok) return bumped.res;

    await deleteJournal(db, trip.id, entryId);
    return c.json({ ok: true, tripVersion: bumped.trip.version });
  },
);
