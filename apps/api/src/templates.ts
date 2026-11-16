import { Hono } from "hono";
import {
  CITY_TEMPLATES,
  addDaysIso,
  getCityTemplate,
  placeRefForTemplateStop,
  todayIsoDate,
  type CreateFromTemplateInput,
  type Day,
  type Stop,
  type Trip,
} from "@beaver/core";
import type { AuthVariables } from "./auth.js";
import { requireAuth } from "./auth.js";
import { dbOf } from "./db/context.js";
import type { Bindings } from "./env.js";
import {
  insertTrip,
  nowIso,
  replaceDays,
  replaceLegs,
  replaceStops,
  upsertMember,
} from "./store.js";

export const templateRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

/** List read-only city playbooks (城市玩法). */
templateRoutes.get("/v1/templates", (c) => {
  return c.json({
    templates: CITY_TEMPLATES.map((tpl) => ({
      id: tpl.id,
      title: tpl.title,
      destination: tpl.destination,
      description: tpl.description,
      timezone: tpl.timezone,
      locale: tpl.locale,
      accent: tpl.accent,
      dayCount: tpl.days.length,
      stopCount: tpl.days.reduce((n, d) => n + d.stops.length, 0),
    })),
  });
});

templateRoutes.get("/v1/templates/:id", (c) => {
  const tpl = getCityTemplate(c.req.param("id"));
  if (!tpl) return c.json({ error: "not_found" }, 404);
  return c.json({ template: tpl });
});

/** Create a new trip owned by the current user from a city template. */
templateRoutes.post("/v1/templates/:id/create", requireAuth, async (c) => {
  const tpl = getCityTemplate(c.req.param("id"));
  if (!tpl) return c.json({ error: "not_found" }, 404);

  let body: CreateFromTemplateInput = {};
  try {
    const text = await c.req.text();
    if (text.trim()) body = JSON.parse(text) as CreateFromTemplateInput;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const auth = c.get("auth")!;
  const db = dbOf(c);
  const stamp = nowIso();
  const start = body.startDate?.trim() || todayIsoDate();
  const maxOffset = Math.max(...tpl.days.map((d) => d.dayOffset), 0);
  const end = addDaysIso(start, maxOffset);
  const locale = tpl.locale;
  const title =
    body.title?.trim() ||
    tpl.title[locale] ||
    tpl.title["zh-CN"];

  const tripId = crypto.randomUUID();
  const trip: Trip = {
    id: tripId,
    title,
    destination: tpl.destination,
    startDate: start,
    endDate: end,
    timezone: tpl.timezone,
    locale,
    mapEngine: "auto",
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

  const dayIdByOffset = new Map<number, string>();
  const days: Day[] = tpl.days.map((d) => {
    const id = crypto.randomUUID();
    dayIdByOffset.set(d.dayOffset, id);
    return {
      id,
      tripId,
      date: addDaysIso(start, d.dayOffset),
      note: d.note,
    };
  });
  await replaceDays(db, tripId, days);

  const stops: Stop[] = [];
  for (const d of tpl.days) {
    const dayId = dayIdByOffset.get(d.dayOffset)!;
    d.stops.forEach((s, order) => {
      stops.push({
        id: crypto.randomUUID(),
        dayId,
        order,
        place: placeRefForTemplateStop(s),
        userNote: s.userNote,
        photos: [],
      });
    });
  }
  await replaceStops(db, tripId, stops);
  await replaceLegs(db, tripId, []);

  return c.json(
    {
      trip,
      days,
      stops,
      legs: [],
      yourRole: "owner" as const,
      templateId: tpl.id,
    },
    201,
  );
});
