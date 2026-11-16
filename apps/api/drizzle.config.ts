import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// Prefer apps/api/.dev.vars (Wrangler local), then root .env
loadEnv({ path: resolve(root, ".dev.vars") });
loadEnv({ path: resolve(root, "../../.env") });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://user:pass@localhost/beaver_plan",
  },
  strict: true,
  verbose: true,
});
