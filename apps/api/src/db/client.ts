import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { schema } from "./schema.js";

export type Db = NeonHttpDatabase<typeof schema>;

export class DatabaseConfigError extends Error {
  readonly code = "database_url_required" as const;

  constructor() {
    super(
      "DATABASE_URL is required. Create a Neon project (free tier works), copy the connection string, set it in apps/api/.dev.vars (local) or `wrangler secret put DATABASE_URL` (prod), then run `pnpm --filter @beaver/api db:migrate`.",
    );
    this.name = "DatabaseConfigError";
  }
}

export function requireDatabaseUrl(url: string | undefined): string {
  const trimmed = url?.trim();
  if (!trimmed) throw new DatabaseConfigError();
  return trimmed;
}

/** Neon HTTP driver — works on Cloudflare Workers without a TCP socket. */
export function createDb(databaseUrl: string): Db {
  const sql = neon(requireDatabaseUrl(databaseUrl));
  return drizzle(sql, { schema });
}

export function dbFromEnv(env: { DATABASE_URL?: string }): Db {
  return createDb(requireDatabaseUrl(env.DATABASE_URL));
}
