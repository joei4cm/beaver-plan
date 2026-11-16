import { Hono } from "hono";
import {
  parseMentions,
  type CreateTripCommentInput,
  type TripComment,
} from "@beaver/core";
import type { AuthVariables } from "./auth.js";
import { requireAuth } from "./auth.js";
import { assertCanEdit, assertCanView } from "./access.js";
import { dbOf } from "./db/context.js";
import type { Bindings } from "./env.js";
import {
  appendActivity,
  getTrip,
  insertComment,
  listActivity,
  listComments,
  listMembers,
  listStops,
  makeActivityEvent,
  nowIso,
} from "./store.js";

export const commentRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

commentRoutes.get("/v1/trips/:id/comments", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  if (trip.id !== "sample-kyoto") {
    const access = await assertCanView(c, trip.id);
    if (!access.ok) return access.res;
  }
  const stopId = c.req.query("stopId") || undefined;
  if (stopId) {
    const stops = await listStops(db, trip.id);
    if (!stops.some((s) => s.id === stopId)) {
      return c.json({ error: "stop_not_found" }, 404);
    }
  }
  const comments = await listComments(db, trip.id, stopId);
  return c.json({ comments });
});

commentRoutes.post("/v1/trips/:id/comments", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let body: CreateTripCommentInput;
  try {
    body = await c.req.json<CreateTripCommentInput>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const text = body.body?.trim() ?? "";
  if (!text) return c.json({ error: "body_required" }, 400);
  if (text.length > 2000) return c.json({ error: "body_too_long" }, 400);

  let stopId = body.stopId?.trim() || undefined;
  let placeName: string | undefined;
  if (stopId) {
    const stops = await listStops(db, trip.id);
    const stop = stops.find((s) => s.id === stopId);
    if (!stop) return c.json({ error: "stop_not_found" }, 404);
    placeName = stop.place.name;
  }

  const members = await listMembers(db, trip.id);
  const mentions = parseMentions(
    text,
    members
      .map((m) => m.displayName)
      .filter((n): n is string => Boolean(n?.trim())),
  );

  const stamp = nowIso();
  const comment: TripComment = {
    id: crypto.randomUUID(),
    tripId: trip.id,
    stopId,
    authorUserId: access.auth.userId,
    authorDisplayName:
      access.member.displayName ?? access.auth.displayName ?? undefined,
    body: text,
    mentions,
    createdAt: stamp,
  };
  await insertComment(db, comment);

  const where = placeName ? ` on ${placeName}` : "";
  await appendActivity(
    db,
    makeActivityEvent({
      tripId: trip.id,
      type: "comment_added",
      actorUserId: comment.authorUserId,
      actorDisplayName: comment.authorDisplayName,
      summary: `${comment.authorDisplayName ?? comment.authorUserId} commented${where}`,
      payload: {
        commentId: comment.id,
        stopId: comment.stopId,
        mentions: comment.mentions,
      },
      createdAt: stamp,
    }),
  );

  return c.json({ comment }, 201);
});

commentRoutes.get("/v1/trips/:id/activity", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  if (trip.id !== "sample-kyoto") {
    const access = await assertCanView(c, trip.id);
    if (!access.ok) return access.res;
  }
  const rawLimit = Number(c.req.query("limit") ?? "40");
  const limit = Number.isFinite(rawLimit) ? rawLimit : 40;
  const events = await listActivity(db, trip.id, limit);
  return c.json({ events });
});
