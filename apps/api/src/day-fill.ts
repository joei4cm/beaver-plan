import { Hono } from "hono";
import {
  createDayFillStack,
  DAY_FILL_INTERESTS,
  DEMO_PLACES,
  inferRegionHint,
  materializeDayFill,
  normalizeInterests,
  reportDayFillCapabilities,
  resolveMapEngine,
  tripDatesFromDays,
  type DayFillInterest,
  type DayFillPrefs,
  type DayFillProposal,
  type MapEnginePreference,
} from "@beaver/core";
import type { AuthVariables } from "./auth.js";
import {
  applyVersionOrConflict,
  assertCanEdit,
  assertCanView,
  parseExpectedVersion,
} from "./access.js";
import { dbOf } from "./db/context.js";
import type { Bindings } from "./env.js";
import {
  getTrip,
  listDays,
  listStops,
  nowIso,
  replaceDays,
  replaceLegs,
  replaceStops,
  updateTrip,
} from "./store.js";

export const dayFillRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

function stackFrom(env: Bindings) {
  return createDayFillStack({
    openaiApiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: env.OPENAI_BASE_URL,
    openaiChatModel: env.OPENAI_CHAT_MODEL,
    llmProvider: env.LLM_PROVIDER,
  });
}

function preferenceFrom(
  raw: string | undefined | MapEnginePreference,
  fallback: string,
): MapEnginePreference {
  const v = String(raw ?? fallback ?? "auto").toLowerCase();
  if (v === "google" || v === "amap" || v === "auto") return v;
  return "auto";
}

dayFillRoutes.get("/v1/day-fill/status", (c) => {
  const stack = stackFrom(c.env);
  return c.json({
    ...reportDayFillCapabilities(stack),
    interests: DAY_FILL_INTERESTS,
    keys: { openai: Boolean(c.env.OPENAI_API_KEY) },
  });
});

dayFillRoutes.get("/v1/trips/:id/day-fill/status", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  if (trip.id !== "sample-kyoto") {
    const access = await assertCanView(c, trip.id);
    if (!access.ok) return access.res;
  }
  const stack = stackFrom(c.env);
  return c.json({
    tripId: trip.id,
    ...reportDayFillCapabilities(stack),
    interests: DAY_FILL_INTERESTS,
  });
});

type ProposeBody = {
  interests?: string[];
  maxWalkMinutesPerDay?: number;
  dayCount?: number;
  locale?: "zh-CN" | "en";
};

dayFillRoutes.post("/v1/trips/:id/day-fill/propose", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let body: ProposeBody;
  try {
    body = await c.req.json<ProposeBody>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const interests = normalizeInterests(body.interests) as DayFillInterest[];
  const maxWalkMinutesPerDay = Math.max(
    20,
    Math.min(240, Number(body.maxWalkMinutesPerDay) || 60),
  );
  const dayCount =
    body.dayCount !== undefined
      ? Math.max(1, Math.min(7, Math.floor(body.dayCount)))
      : undefined;

  const prefs: DayFillPrefs = {
    interests,
    maxWalkMinutesPerDay,
    dayCount,
  };

  const days = await listDays(db, trip.id);
  const stops = await listStops(db, trip.id);
  const stack = stackFrom(c.env);
  const catalog = DEMO_PLACES;

  try {
    const result = await stack.provider.propose({
      trip,
      days,
      stops,
      prefs,
      catalog,
      locale: body.locale ?? trip.locale,
    });

    const proposal: DayFillProposal = {
      id: crypto.randomUUID(),
      tripId: trip.id,
      mode: stack.mode,
      provider: stack.provider.id,
      prefs: {
        interests,
        maxWalkMinutesPerDay,
        dayCount:
          dayCount ?? (days.length > 0 ? days.length : result.days.length),
      },
      rationale: result.rationale,
      days: result.days,
      createdAt: nowIso(),
    };

    // Draft is client-held until /apply — no Neon write yet.
    return c.json({
      proposal,
      draft: true,
      mode: stack.mode,
      provider: stack.provider.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "day_fill_failed";
    return c.json({ error: message, mode: stack.mode }, 502);
  }
});

type ApplyBody = {
  proposal: DayFillProposal;
  expectedVersion?: number;
};

dayFillRoutes.post("/v1/trips/:id/day-fill/apply", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;

  let body: ApplyBody;
  try {
    body = await c.req.json<ApplyBody>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!body.proposal?.days || !Array.isArray(body.proposal.days)) {
    return c.json({ error: "proposal_required" }, 400);
  }
  if (body.proposal.tripId && body.proposal.tripId !== trip.id) {
    return c.json({ error: "proposal_trip_mismatch" }, 400);
  }

  const bumped = await applyVersionOrConflict(
    c,
    trip,
    parseExpectedVersion(body),
  );
  if (!bumped.ok) return bumped.res;

  const existingDays = await listDays(db, trip.id);
  const region =
    (c.env.MAP_AUTO_AMAP_CN ?? "true") !== "false"
      ? inferRegionHint({
          cfCountry: c.req.header("cf-ipcountry"),
          acceptLanguage: c.req.header("accept-language"),
          timezone: bumped.trip.timezone,
        })
      : ("other" as const);
  const engineId = resolveMapEngine(
    preferenceFrom(bumped.trip.mapEngine, c.env.DEFAULT_MAP_ENGINE ?? "auto"),
    region,
  );

  const { days, stops } = materializeDayFill({
    trip: bumped.trip,
    proposal: body.proposal,
    existingDays,
    engine: engineId,
    newId: () => crypto.randomUUID(),
  });

  await replaceDays(db, trip.id, days);
  await replaceStops(db, trip.id, stops);
  await replaceLegs(db, trip.id, []);

  const dates = tripDatesFromDays(days);
  const nextTrip = await updateTrip(db, {
    ...bumped.trip,
    startDate: dates.startDate ?? bumped.trip.startDate,
    endDate: dates.endDate ?? bumped.trip.endDate,
    updatedAt: nowIso(),
  });

  return c.json({
    trip: nextTrip,
    days,
    stops,
    legs: [],
    tripVersion: nextTrip.version,
    applied: {
      days: days.length,
      stops: stops.length,
      mode: body.proposal.mode,
      provider: body.proposal.provider,
    },
  });
});
