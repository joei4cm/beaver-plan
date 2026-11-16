import { Hono } from "hono";
import { cors } from "hono/cors";
import type { CreateTripInput, Trip } from "@beaver/core";
import { t, type Locale } from "@beaver/i18n";

type Bindings = {
  APP_NAME: string;
  DEFAULT_LOCALE: string;
  DEFAULT_MAP_ENGINE: string;
  MAP_AUTO_AMAP_CN: string;
  FEATURE_TRANSLATION: string;
  CLERK_SECRET_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

/** In-memory stub store — replace with Neon/Drizzle in a later Slice A PR. */
const trips = new Map<string, Trip>();

function nowIso() {
  return new Date().toISOString();
}

function localeFrom(c: { req: { header: (n: string) => string | undefined } }): Locale {
  const header = c.req.header("accept-language") ?? "";
  if (header.toLowerCase().startsWith("en")) return "en";
  return "zh-CN";
}

app.get("/health", (c) => {
  const locale = localeFrom(c);
  return c.json({
    status: t(locale, "api.health"),
    app: c.env.APP_NAME ?? "Beaver Plan",
    ts: nowIso(),
  });
});

app.get("/v1/trips", (c) => {
  return c.json({
    trips: Array.from(trips.values()),
    auth: "Clerk placeholder — set CLERK_SECRET_KEY",
  });
});

app.get("/v1/trips/:id", (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  return c.json({ trip });
});

app.post("/v1/trips", async (c) => {
  let body: CreateTripInput;
  try {
    body = await c.req.json<CreateTripInput>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!body.title?.trim()) {
    return c.json({ error: "title_required" }, 400);
  }

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

  return c.json({ trip }, 201);
});

app.delete("/v1/trips/:id", (c) => {
  const id = c.req.param("id");
  if (!trips.has(id)) return c.json({ error: "not_found" }, 404);
  trips.delete(id);
  return c.json({ ok: true });
});

export default app;
