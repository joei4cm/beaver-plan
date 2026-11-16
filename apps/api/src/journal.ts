import { Hono } from "hono";
import type {
  CreateJournalInput,
  JournalEntry,
  UpdateJournalInput,
} from "@beaver/core";
import type { Bindings } from "./env.js";
import {
  daysByTrip,
  journalByTrip,
  nowIso,
  stopsByTrip,
  trips,
} from "./store.js";

export const journalRoutes = new Hono<{ Bindings: Bindings }>();

journalRoutes.get("/v1/trips/:id/journal", (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const dayId = c.req.query("dayId");
  const stopId = c.req.query("stopId");
  let entries = journalByTrip.get(trip.id) ?? [];
  if (dayId) entries = entries.filter((e) => e.dayId === dayId);
  if (stopId) entries = entries.filter((e) => e.stopId === stopId);
  entries = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return c.json({ entries });
});

journalRoutes.post("/v1/trips/:id/journal", async (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  let body: CreateJournalInput;
  try {
    body = await c.req.json<CreateJournalInput>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body.body?.trim() && !(body.media && body.media.length > 0)) {
    return c.json({ error: "body_or_media_required" }, 400);
  }
  if (body.dayId) {
    const days = daysByTrip.get(trip.id) ?? [];
    if (!days.some((d) => d.id === body.dayId)) {
      return c.json({ error: "day_not_found" }, 404);
    }
  }
  if (body.stopId) {
    const stops = stopsByTrip.get(trip.id) ?? [];
    if (!stops.some((s) => s.id === body.stopId)) {
      return c.json({ error: "stop_not_found" }, 404);
    }
  }

  const stamp = nowIso();
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
  const list = journalByTrip.get(trip.id) ?? [];
  journalByTrip.set(trip.id, [...list, entry]);
  trips.set(trip.id, {
    ...trip,
    version: trip.version + 1,
    updatedAt: stamp,
  });
  return c.json({ entry }, 201);
});

journalRoutes.patch("/v1/trips/:id/journal/:entryId", async (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const entryId = c.req.param("entryId");
  const list = journalByTrip.get(trip.id) ?? [];
  const idx = list.findIndex((e) => e.id === entryId);
  if (idx < 0) return c.json({ error: "entry_not_found" }, 404);

  let body: UpdateJournalInput;
  try {
    body = await c.req.json<UpdateJournalInput>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

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
  const updated = [...list];
  updated[idx] = next;
  journalByTrip.set(trip.id, updated);
  trips.set(trip.id, {
    ...trip,
    version: trip.version + 1,
    updatedAt: nowIso(),
  });
  return c.json({ entry: next });
});

journalRoutes.delete("/v1/trips/:id/journal/:entryId", (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const entryId = c.req.param("entryId");
  const list = journalByTrip.get(trip.id) ?? [];
  if (!list.some((e) => e.id === entryId)) {
    return c.json({ error: "entry_not_found" }, 404);
  }
  journalByTrip.set(
    trip.id,
    list.filter((e) => e.id !== entryId),
  );
  trips.set(trip.id, {
    ...trip,
    version: trip.version + 1,
    updatedAt: nowIso(),
  });
  return c.json({ ok: true });
});
