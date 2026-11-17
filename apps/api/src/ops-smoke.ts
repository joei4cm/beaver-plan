import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Bindings } from "./env.js";
import { dbOf, isDatabaseConfigError } from "./db/context.js";
import {
  deleteObject,
  getObject,
  isS3Configured,
  putObject,
  requireS3Config,
  S3ConfigError,
} from "./s3.js";

/**
 * Operator connectivity smoke — only registered when SMOKE_TOKEN is set.
 * Reports db reachability + media round-trip without echoing secrets.
 */
export const opsSmokeRoutes = new Hono<{ Bindings: Bindings }>();

function smokeToken(env: Bindings): string | null {
  const t = env.SMOKE_TOKEN?.trim();
  return t && t.length >= 8 ? t : null;
}

function authorized(c: {
  env: Bindings;
  req: { header: (n: string) => string | undefined };
}): "missing" | "unauthorized" | "ok" {
  const expected = smokeToken(c.env);
  if (!expected) return "missing";
  const header = c.req.header("authorization") ?? "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const alt = c.req.header("x-beaver-smoke-token")?.trim();
  const got = bearer || alt;
  if (!got || got !== expected) return "unauthorized";
  return "ok";
}

opsSmokeRoutes.get("/v1/ops/smoke", async (c) => {
  const gate = authorized(c);
  if (gate === "missing") {
    // Endpoint disabled when SMOKE_TOKEN unset — do not advertise.
    return c.json({ error: "not_found" }, 404);
  }
  if (gate === "unauthorized") {
    return c.json({ error: "unauthorized" }, 401);
  }

  const beaverEnv = c.env.BEAVER_ENV ?? "local";
  const hasDb = Boolean(c.env.DATABASE_URL?.trim());
  const hasS3 = isS3Configured(c.env);

  let database: {
    configured: boolean;
    ok: boolean;
    error?: string;
  } = { configured: hasDb, ok: false };

  if (hasDb) {
    try {
      const db = dbOf(c);
      await db.execute(sql`select 1 as ok`);
      database = { configured: true, ok: true };
    } catch (err) {
      if (isDatabaseConfigError(err)) {
        database = { configured: false, ok: false, error: "database_url_required" };
      } else {
        const message = err instanceof Error ? err.message : "database_error";
        // Never include connection strings; keep message short.
        database = {
          configured: true,
          ok: false,
          error: message.replace(/postgresql:\/\/[^\s"']+/gi, "[redacted]").slice(0, 120),
        };
      }
    }
  }

  let media: {
    configured: boolean;
    ok: boolean;
    storage: "s3" | "unconfigured";
    error?: string;
  } = {
    configured: hasS3,
    ok: false,
    storage: hasS3 ? "s3" : "unconfigured",
  };

  if (hasS3) {
    const key = `smoke/ops-${crypto.randomUUID()}.txt`;
    const body = new TextEncoder().encode("beaver-plan-ops-smoke");
    try {
      const cfg = requireS3Config(c.env);
      await putObject(cfg, {
        key,
        body,
        contentType: "text/plain",
      });
      const got = await getObject(cfg, key);
      const ok =
        Boolean(got) &&
        new TextDecoder().decode(got!.body) === "beaver-plan-ops-smoke";
      try {
        await deleteObject(cfg, key);
      } catch {
        // Best-effort cleanup; ignore delete failures.
      }
      media = {
        configured: true,
        ok,
        storage: "s3",
        ...(ok ? {} : { error: "round_trip_mismatch" }),
      };
    } catch (err) {
      if (err instanceof S3ConfigError) {
        media = { configured: false, ok: false, storage: "unconfigured" };
      } else {
        const message = err instanceof Error ? err.message : "s3_error";
        media = {
          configured: true,
          ok: false,
          storage: "s3",
          error: message.slice(0, 120),
        };
      }
    }
  }

  const pass = database.ok && media.ok;
  return c.json({
    ok: pass,
    ts: new Date().toISOString(),
    deploy: { env: beaverEnv },
    database,
    media,
    note: "Booleans + short errors only — no connection strings, keys, or tokens.",
  });
});
