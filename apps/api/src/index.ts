import { Hono } from "hono";
import { cors } from "hono/cors";
import { t, type Locale } from "@beaver/i18n";
import { attachAuth, clerkConfigured, type AuthVariables } from "./auth.js";
import {
  databaseMissingResponse,
  dbOf,
  isDatabaseConfigError,
} from "./db/context.js";
import { DatabaseConfigError } from "./db/client.js";
import type { Bindings } from "./env.js";
import { bookingRoutes } from "./booking.js";
import { commentRoutes } from "./comments.js";
import { dayFillRoutes } from "./day-fill.js";
import { journalRoutes } from "./journal.js";
import { mapsRoutes } from "./maps.js";
import { mediaRoutes } from "./media.js";
import { memberRoutes } from "./members.js";
import { opsSmokeRoutes } from "./ops-smoke.js";
import { shareRoutes } from "./share.js";
import { translationRoutes } from "./translation.js";
import { templateRoutes } from "./templates.js";
import { tripRoutes } from "./trips.js";
import { ensureSampleTrip, nowIso } from "./store.js";
import {
  createBookingStack,
  createDayFillStack,
  createTranslationStack,
  reportBookingCapabilities,
  reportDayFillCapabilities,
  reportTranslationCapabilities,
} from "@beaver/core";
import { isS3Configured } from "./s3.js";

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

/** Localhost + PUBLIC_WEB_ORIGIN (production web). Never echoes secrets. */
function corsOrigins(env: Bindings): string[] {
  const allowed = new Set<string>([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const web = env.PUBLIC_WEB_ORIGIN?.trim().replace(/\/$/, "");
  if (web) allowed.add(web);
  // Local / unset deploy target: allow any origin for wrangler dev convenience.
  const beaverEnv = (env.BEAVER_ENV ?? "local").toLowerCase();
  if (beaverEnv === "local" || beaverEnv === "dev") {
    allowed.add("*");
  }
  return [...allowed];
}

app.use("*", async (c, next) => {
  const handler = cors({
    origin: corsOrigins(c.env),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Accept",
      "Authorization",
      "X-Beaver-User-Id",
      "X-Beaver-Display-Name",
    ],
    exposeHeaders: ["X-Beaver-Trip-Version"],
  });
  return handler(c, next);
});

/**
 * Persistence requires Neon/Postgres. No silent in-memory fallback for trips.
 * Media bytes require S3/R2 — /v1/media* returns 503 when unset (no memory fallback).
 */
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  // Health/maps/translation can answer without DB; trip-shaped routes cannot.
  // Template catalog is code-seeded (GET); creating from a template writes Neon.
  const needsDb =
    path.startsWith("/v1/trips") ||
    (path.startsWith("/v1/templates") && c.req.method !== "GET") ||
    path.startsWith("/v1/invites") ||
    path.startsWith("/v1/share");
  if (!needsDb) {
    await next();
    return;
  }
  if (!c.env.DATABASE_URL?.trim()) {
    return databaseMissingResponse(c);
  }
  try {
    await ensureSampleTrip(dbOf(c), c.env);
  } catch (err) {
    if (isDatabaseConfigError(err)) return databaseMissingResponse(c);
    const message = err instanceof Error ? err.message : "database_error";
    return c.json(
      {
        error: "database_unavailable",
        message,
        hint: "Check DATABASE_URL / Neon project status, then pnpm --filter @beaver/api db:migrate",
      },
      503,
    );
  }
  await next();
});

app.onError((err, c) => {
  if (err instanceof DatabaseConfigError || isDatabaseConfigError(err)) {
    return databaseMissingResponse(c);
  }
  console.error(err);
  return c.json(
    { error: "internal_error", message: err instanceof Error ? err.message : "error" },
    500,
  );
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
  const translationEnabled = (c.env.FEATURE_TRANSLATION ?? "true") !== "false";
  const translation = reportTranslationCapabilities(
    createTranslationStack({
      openaiApiKey: c.env.OPENAI_API_KEY,
      openaiBaseUrl: c.env.OPENAI_BASE_URL,
      deepgramApiKey: c.env.DEEPGRAM_API_KEY,
      asrProvider: c.env.ASR_PROVIDER,
      llmProvider: c.env.LLM_PROVIDER,
      ttsProvider: c.env.TTS_PROVIDER,
    }),
    translationEnabled,
  );
  const dayFill = reportDayFillCapabilities(
    createDayFillStack({
      openaiApiKey: c.env.OPENAI_API_KEY,
      openaiBaseUrl: c.env.OPENAI_BASE_URL,
      openaiChatModel: c.env.OPENAI_CHAT_MODEL,
      llmProvider: c.env.LLM_PROVIDER,
    }),
  );
  const booking = reportBookingCapabilities(
    createBookingStack({
      otaProvider: c.env.OTA_PROVIDER,
      amadeusApiKey: c.env.AMADEUS_API_KEY,
      amadeusApiSecret: c.env.AMADEUS_API_SECRET,
      bookingAffiliateId: c.env.BOOKING_AFFILIATE_ID,
    }),
  );
  const hasDb = Boolean(c.env.DATABASE_URL?.trim());
  const hasS3 = isS3Configured(c.env);
  const beaverEnv = c.env.BEAVER_ENV ?? "local";
  const webOrigin =
    c.env.PUBLIC_WEB_ORIGIN?.trim().replace(/\/$/, "") || null;
  // Configured flags only — never echo secret values or connection strings.
  return c.json({
    status: t(locale, "api.health"),
    app: c.env.APP_NAME ?? "Beaver Plan",
    ts: nowIso(),
    deploy: {
      env: beaverEnv,
      publicWebOrigin: webOrigin,
      workers: true,
    },
    auth: {
      clerk: clerkConfigured(c.env),
      wechatUi: wechat,
      mode: clerkConfigured(c.env) ? "clerk" : "demo",
    },
    database: {
      configured: hasDb,
      driver: "neon-http + drizzle",
      required: true,
      note: hasDb
        ? "Trips / journal / members / invites / comments / activity / share artifacts persist in Neon Postgres"
        : "Set DATABASE_URL (Neon) — trip APIs return 503 until configured",
    },
    maps: {
      google: Boolean(c.env.GOOGLE_MAPS_SERVER_KEY?.trim()),
      amap: Boolean(c.env.AMAP_SERVER_KEY?.trim()),
      baidu: Boolean(c.env.BAIDU_MAP_SERVER_KEY?.trim()),
      defaultEngine: c.env.DEFAULT_MAP_ENGINE ?? "auto",
      autoAmapCn: (c.env.MAP_AUTO_AMAP_CN ?? "true") !== "false",
    },
    translation,
    dayFill,
    booking: {
      ...booking,
      keys: {
        amadeus: Boolean(
          c.env.AMADEUS_API_KEY?.trim() && c.env.AMADEUS_API_SECRET?.trim(),
        ),
        bookingAffiliate: Boolean(c.env.BOOKING_AFFILIATE_ID?.trim()),
      },
    },
    media: {
      storage: hasS3 ? "s3" : "unconfigured",
      configured: hasS3,
      required: true,
      driver: "aws4fetch (S3-compatible → Cloudflare R2)",
      note: hasS3
        ? "Journal/share media bytes in S3/R2; Neon stores object keys"
        : "Set S3_ENDPOINT|R2_ACCOUNT_ID + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY + S3_BUCKET — /v1/media returns 503 until configured",
    },
    ops: {
      smoke: Boolean(c.env.SMOKE_TOKEN?.trim() && c.env.SMOKE_TOKEN.trim().length >= 8),
      path: "/v1/ops/smoke",
      note: "Auth-gated connectivity check when SMOKE_TOKEN is set (Bearer or X-Beaver-Smoke-Token). Returns 404 when unset.",
    },
    features: {
      translation: translationEnabled,
      clerkWechatUi: wechat,
    },
  });
});

app.route("/", opsSmokeRoutes);
app.route("/", mapsRoutes);
app.route("/", tripRoutes);
app.route("/", templateRoutes);
app.route("/", memberRoutes);
app.route("/", commentRoutes);
app.route("/", journalRoutes);
app.route("/", mediaRoutes);
app.route("/", shareRoutes);
app.route("/", translationRoutes);
app.route("/", dayFillRoutes);
app.route("/", bookingRoutes);

export default app;
