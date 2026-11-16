import type { Bindings } from "../env.js";
import {
  DatabaseConfigError,
  createDb,
  requireDatabaseUrl,
  type Db,
} from "./client.js";

/** Minimal env handle — avoids Hono Context variance issues across route apps. */
type EnvCarrier = {
  env: Bindings;
  json: (body: unknown, status?: number) => Response;
};

const cache = new WeakMap<object, Db>();

/** Per-request (env-object) Drizzle client. Fails if DATABASE_URL is unset. */
export function dbOf(c: EnvCarrier): Db {
  const env = c.env as object;
  const cached = cache.get(env);
  if (cached) return cached;
  const db = createDb(requireDatabaseUrl(c.env.DATABASE_URL));
  cache.set(env, db);
  return db;
}

export function databaseMissingResponse(c: EnvCarrier) {
  return c.json(
    {
      error: "database_url_required",
      message:
        "Set DATABASE_URL to a Neon Postgres connection string (apps/api/.dev.vars locally, or wrangler secret put DATABASE_URL). Free Neon projects work. Then run: pnpm --filter @beaver/api db:migrate",
      docs: "See README → Neon / Postgres",
    },
    503,
  );
}

export function isDatabaseConfigError(err: unknown): err is DatabaseConfigError {
  return err instanceof DatabaseConfigError;
}
