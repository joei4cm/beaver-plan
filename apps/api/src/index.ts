import { Hono } from "hono";
import { cors } from "hono/cors";
import { t, type Locale } from "@beaver/i18n";
import { attachAuth, clerkConfigured, type AuthVariables } from "./auth.js";
import type { Bindings } from "./env.js";
import { journalRoutes } from "./journal.js";
import { mapsRoutes } from "./maps.js";
import { mediaRoutes } from "./media.js";
import { memberRoutes } from "./members.js";
import { shareRoutes } from "./share.js";
import { tripRoutes } from "./trips.js";
import { ensureSampleTrip, nowIso } from "./store.js";

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Accept",
      "Authorization",
      "X-Beaver-User-Id",
      "X-Beaver-Display-Name",
    ],
    exposeHeaders: ["X-Beaver-Trip-Version"],
  }),
);

/** Seed demo trip after the Worker runtime clock is available. */
app.use("*", async (c, next) => {
  ensureSampleTrip();
  await next();
});

app.use("*", attachAuth);

function localeFrom(c: {
  req: { header: (n: string) => string | undefined };
}): Locale {
  const header = c.req.header("accept-language") ?? "";
  if (header.toLowerCase().startsWith("en")) return "en";
  return "zh-CN";
}

app.get("/health", (c) => {
  const locale = localeFrom(c);
  const wechat =
    (c.env.CLERK_WECHAT_ENABLED ?? c.env.NEXT_PUBLIC_CLERK_WECHAT_ENABLED) ===
    "true";
  return c.json({
    status: t(locale, "api.health"),
    app: c.env.APP_NAME ?? "Beaver Plan",
    ts: nowIso(),
    auth: {
      clerk: clerkConfigured(c.env),
      wechatUi: wechat,
      mode: clerkConfigured(c.env) ? "clerk" : "demo",
    },
    maps: {
      google: Boolean(c.env.GOOGLE_MAPS_SERVER_KEY),
      amap: Boolean(c.env.AMAP_SERVER_KEY),
    },
    media: {
      storage: "memory",
      r2Ready: true,
      note: "Bind R2 as MEDIA to replace in-memory media stubs",
    },
  });
});

app.route("/", mapsRoutes);
app.route("/", tripRoutes);
app.route("/", memberRoutes);
app.route("/", journalRoutes);
app.route("/", mediaRoutes);
app.route("/", shareRoutes);

export default app;
