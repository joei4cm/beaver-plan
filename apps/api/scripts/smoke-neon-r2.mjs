#!/usr/bin/env node
/**
 * Neon + R2 operator smoke (migrate checklist + API / media verification).
 *
 * Dry-run (default when API_BASE_URL unset, or --dry-run / BEAVER_SMOKE_DRY=1):
 *   - No credentials required — safe for CI.
 *   - Prints the operator checklist and exits 0.
 *
 * Live (API_BASE_URL set):
 *   - GET /health → database.configured + media.configured
 *   - Optional GET /v1/trips/sample-kyoto when database.configured
 *   - Optional POST /v1/media tiny upload when media.configured (skip with --skip-upload)
 *   - Optional GET /v1/ops/smoke when SMOKE_TOKEN is set
 *
 * Env:
 *   API_BASE_URL     e.g. http://127.0.0.1:8787 or https://beaver-plan-api-preview.…workers.dev
 *   SMOKE_TOKEN      optional; enables /v1/ops/smoke check
 *   BEAVER_SMOKE_DRY=1  force dry-run
 *
 * Never prints secret values.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(root, "../..");
const args = new Set(process.argv.slice(2));
const forceDry =
  args.has("--dry-run") ||
  args.has("--dry") ||
  process.env.BEAVER_SMOKE_DRY === "1";
const skipUpload = args.has("--skip-upload");
const apiBase = (process.env.API_BASE_URL ?? "").trim().replace(/\/$/, "");
const smokeToken = (process.env.SMOKE_TOKEN ?? "").trim();

function log(msg) {
  console.log(msg);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

/** 1×1 PNG */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function dryRun() {
  log("=== Beaver Plan — Neon + R2 smoke (dry-run) ===");
  log("No live credentials required. Operator checklist:\n");

  const checklist = [
    "1. Neon: create project → copy pooled DATABASE_URL",
    "2. Local: put DATABASE_URL in apps/api/.dev.vars",
    "3. Migrate: pnpm --filter @beaver/api db:migrate",
    "4. R2: create bucket + S3 API token; set S3_ENDPOINT|R2_ACCOUNT_ID, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_REGION=auto",
    "5. R2 CORS: AllowedOrigins = localhost:3000 + PUBLIC_WEB_ORIGIN; methods GET,PUT,HEAD",
    "6. Wrangler (preview|production): secret put DATABASE_URL, S3_ENDPOINT (or R2_ACCOUNT_ID), S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_REGION",
    "7. Optional: wrangler secret put SMOKE_TOKEN (enables GET /v1/ops/smoke)",
    "8. Deploy: pnpm --filter @beaver/api deploy:preview",
    "9. Live smoke: API_BASE_URL=https://… pnpm --filter @beaver/api smoke:neon-r2",
  ];
  for (const line of checklist) log(`  ${line}`);

  // Self-check: docs + route source exist (no network, no secrets).
  const deployDoc = resolve(repoRoot, "docs/deploy-cloudflare.md");
  const keysDoc = resolve(repoRoot, "docs/keys-integration.md");
  const opsSrc = resolve(root, "src/ops-smoke.ts");
  assert.ok(existsSync(deployDoc), "docs/deploy-cloudflare.md missing");
  assert.ok(existsSync(keysDoc), "docs/keys-integration.md missing");
  assert.ok(existsSync(opsSrc), "src/ops-smoke.ts missing");

  const deploy = readFileSync(deployDoc, "utf8");
  assert.match(deploy, /DATABASE_URL/);
  assert.match(deploy, /S3_ACCESS_KEY_ID/);
  assert.match(deploy, /AllowedOrigins/);
  assert.match(deploy, /smoke:neon-r2|Neon \+ R2/);

  const ops = readFileSync(opsSrc, "utf8");
  assert.match(ops, /\/v1\/ops\/smoke/);
  assert.match(ops, /SMOKE_TOKEN/);

  log("\nok dry-run (docs + ops route present; no credentials used)");
  log("Hint: API_BASE_URL=http://127.0.0.1:8787 pnpm --filter @beaver/api smoke:neon-r2");
  process.exit(0);
}

async function liveSmoke() {
  log(`=== Beaver Plan — Neon + R2 smoke (live) ===`);
  log(`API_BASE_URL=${apiBase}\n`);

  let health;
  try {
    const res = await fetch(`${apiBase}/health`);
    if (!res.ok) fail(`/health HTTP ${res.status}`);
    health = await res.json();
  } catch (err) {
    fail(`/health unreachable: ${err instanceof Error ? err.message : err}`);
  }

  const dbConfigured = Boolean(health?.database?.configured);
  const mediaConfigured = Boolean(health?.media?.configured);
  const opsEnabled = Boolean(health?.ops?.smoke);

  log(`deploy.env: ${health?.deploy?.env ?? "?"}`);
  log(`database.configured: ${dbConfigured}`);
  log(`media.configured: ${mediaConfigured} (storage=${health?.media?.storage ?? "?"})`);
  log(`ops.smoke enabled: ${opsEnabled}`);

  if (!dbConfigured) {
    fail("database.configured is false — set DATABASE_URL + migrate, then redeploy/restart");
  }
  if (!mediaConfigured) {
    fail("media.configured is false — set S3_* / R2_* secrets, then redeploy/restart");
  }

  // Sample trip proves migrate + seed path.
  try {
    const tripRes = await fetch(`${apiBase}/v1/trips/sample-kyoto`);
    if (!tripRes.ok) {
      fail(`GET /v1/trips/sample-kyoto → HTTP ${tripRes.status} (run db:migrate?)`);
    }
    const trip = await tripRes.json();
    assert.equal(trip?.trip?.id, "sample-kyoto");
    assert.ok(Array.isArray(trip?.days) && trip.days.length > 0, "sample trip days missing");
    log(`sample-kyoto: ok (${trip.days.length} days)`);
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err;
    fail(`sample-kyoto: ${err instanceof Error ? err.message : err}`);
  }

  if (!skipUpload) {
    try {
      const up = await fetch(`${apiBase}/v1/media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentType: "image/png",
          dataBase64: TINY_PNG_B64,
          tripId: "smoke-neon-r2",
        }),
      });
      if (!up.ok) {
        const text = await up.text().catch(() => "");
        fail(`POST /v1/media → HTTP ${up.status}: ${text.slice(0, 160)}`);
      }
      const body = await up.json();
      assert.ok(body?.id, "media upload missing id");
      assert.ok(body?.key, "media upload missing key");
      log(`media upload: ok (id=${body.id}, key=${body.key})`);

      const getRes = await fetch(`${apiBase}/v1/media/${body.id}?proxy=1`);
      if (!getRes.ok) {
        fail(`GET /v1/media/${body.id}?proxy=1 → HTTP ${getRes.status}`);
      }
      const bytes = new Uint8Array(await getRes.arrayBuffer());
      assert.ok(bytes.byteLength > 0, "empty media body");
      log(`media fetch: ok (${bytes.byteLength} bytes)`);
    } catch (err) {
      if (err instanceof assert.AssertionError) throw err;
      fail(`media round-trip: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    log("media upload: skipped (--skip-upload)");
  }

  if (smokeToken) {
    if (!opsEnabled) {
      log("WARN: SMOKE_TOKEN set locally but /health.ops.smoke is false — put SMOKE_TOKEN on the Worker and redeploy");
    }
    const opsRes = await fetch(`${apiBase}/v1/ops/smoke`, {
      headers: {
        Authorization: `Bearer ${smokeToken}`,
        "X-Beaver-Smoke-Token": smokeToken,
      },
    });
    if (opsRes.status === 404) {
      fail("/v1/ops/smoke → 404 (SMOKE_TOKEN not set on Worker)");
    }
    if (opsRes.status === 401) {
      fail("/v1/ops/smoke → 401 (token mismatch)");
    }
    if (!opsRes.ok) {
      fail(`/v1/ops/smoke → HTTP ${opsRes.status}`);
    }
    const ops = await opsRes.json();
    log(`ops.smoke: ok=${ops.ok} database.ok=${ops.database?.ok} media.ok=${ops.media?.ok}`);
    if (!ops.ok) {
      fail(
        `ops smoke failed: database=${JSON.stringify(ops.database)} media=${JSON.stringify(ops.media)}`,
      );
    }
  } else if (opsEnabled) {
    log("Hint: set SMOKE_TOKEN to exercise GET /v1/ops/smoke connectivity check");
  }

  log("\nok neon + r2 live smoke");
  process.exit(0);
}

if (forceDry || !apiBase) {
  dryRun();
} else {
  liveSmoke().catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
