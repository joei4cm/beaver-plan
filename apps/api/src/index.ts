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
import { commentRoutes } from "./comments.js";
import { dayFillRoutes } from "./day-fill.js";
import { journalRoutes } from "./journal.js";
import { mapsRoutes } from "./maps.js";
import { mediaRoutes } from "./media.js";
import { memberRoutes } from "./members.js";
import { shareRoutes } from "./share.js";
import { translationRoutes } from "./translation.js";
import { templateRoutes } from "./templates.js";
import { tripRoutes } from "./trips.js";
import { ensureSampleTrip, nowIso } from "./store.js";
import {
  createDayFillStack,
  createTranslationStack,
  reportDayFillCapabilities,
  reportTranslationCapabilities,
} from "@beaver/core";
import { isS3Configured } from "./s3.js";

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
  const hasDb = Boolean(c.env.DATABASE_URL?.trim());
  const hasS3 = isS3Configured(c.env);
  return c.json({
    status: t(locale, "api.health"),
    app: c.env.APP_NAME ?? "Beaver Plan",
    ts: nowIso(),
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
      google: Boolean(c.env.GOOGLE_MAPS_SERVER_KEY),
      amap: Boolean(c.env.AMAP_SERVER_KEY),
      defaultEngine: c.env.DEFAULT_MAP_ENGINE ?? "auto",
      autoAmapCn: (c.env.MAP_AUTO_AMAP_CN ?? "true") !== "false",
    },
    translation,
    dayFill,
    media: {
      storage: hasS3 ? "s3" : "unconfigured",
      configured: hasS3,
      required: true,
      driver: "aws4fetch (S3-compatible → Cloudflare R2)",
      note: hasS3
        ? "Journal/share media bytes in S3/R2; Neon stores object keys"
        : "Set S3_ENDPOINT|R2_ACCOUNT_ID + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY + S3_BUCKET — /v1/media returns 503 until configured",
    },
  });
});

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

export default app;
