#!/usr/bin/env node
/**
 * Maps keys operator smoke (Google / Amap / Baidu + auto).
 *
 * Dry-run (default when API_BASE_URL unset, or --dry-run / BEAVER_SMOKE_DRY=1):
 *   - No credentials required — safe for CI.
 *   - Prints Michael's runbook checklist and verifies scaffolding files.
 *
 * Live (API_BASE_URL set):
 *   - GET /health → maps.google / maps.amap / maps.baidu + defaultEngine / autoAmapCn
 *   - GET /v1/maps/engine preference probes (auto CN/other, google, amap, baidu)
 *   - GET /v1/places/search for google / amap / baidu (demo or live)
 *   - POST /v1/directions walk for each engine
 *
 * Env:
 *   API_BASE_URL         e.g. http://127.0.0.1:8787
 *   EXPECT_LIVE=1        fail if a keyed engine still returns mode=demo
 *   EXPECT_GOOGLE=1      fail if /health maps.google is false
 *   EXPECT_AMAP=1        fail if /health maps.amap is false
 *   EXPECT_BAIDU=1       fail if /health maps.baidu is false
 *   BEAVER_SMOKE_DRY=1   force dry-run
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
const apiBase = (process.env.API_BASE_URL ?? "").trim().replace(/\/$/, "");
const expectLive = process.env.EXPECT_LIVE === "1";
const expectGoogle = process.env.EXPECT_GOOGLE === "1";
const expectAmap = process.env.EXPECT_AMAP === "1";
const expectBaidu = process.env.EXPECT_BAIDU === "1";

/** Kyoto walk (WGS84) — Google / demo. */
const KYOTO = {
  origin: { lat: 34.9671, lng: 135.7727 },
  destination: { lat: 34.9949, lng: 135.785 },
  q: "清水寺",
  lat: 34.9949,
  lng: 135.785,
};

/** Shanghai walk (GCJ-02-ish demo coords) — Amap. */
const SHANGHAI = {
  origin: { lat: 31.2404, lng: 121.4905 },
  destination: { lat: 31.2272, lng: 121.4921 },
  q: "外滩",
  lat: 31.2404,
  lng: 121.4905,
};

/** Beijing walk — Baidu (BD-09 when live). */
const BEIJING = {
  origin: { lat: 39.9163, lng: 116.3972 },
  destination: { lat: 39.9087, lng: 116.3975 },
  q: "故宫",
  lat: 39.9163,
  lng: 116.3972,
};

const ENGINE_FIXTURES = {
  google: KYOTO,
  amap: SHANGHAI,
  baidu: BEIJING,
};

function log(msg) {
  console.log(msg);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { res, body };
}

function dryRun() {
  log("=== Beaver Plan — Maps keys smoke (dry-run) ===");
  log("No live credentials required. Operator checklist (Michael):\n");

  const checklist = [
    "1. Google Maps Platform: enable Places API (New) + Routes API → copy server key",
    "2. 高德开放平台: Web服务 key → AMAP_SERVER_KEY",
    "3. 百度地图开放平台: Web服务 AK (Place v2 + DirectionLite) → BAIDU_MAP_SERVER_KEY",
    "4. API: apps/api/.dev.vars → GOOGLE_MAPS_SERVER_KEY, AMAP_SERVER_KEY, BAIDU_MAP_SERVER_KEY",
    "5. Keep DEFAULT_MAP_ENGINE=auto and MAP_AUTO_AMAP_CN=true (product mainland rule)",
    "6. Restart pnpm dev:api (Wrangler reloads .dev.vars)",
    "7. Verify: GET /health → maps.google / maps.amap / maps.baidu booleans match keys",
    "8. Auto: /v1/maps/engine?preference=auto&timezone=Asia/Shanghai → engineId=amap",
    "9. Auto: …&timezone=America/Los_Angeles → engineId=google; preference=baidu is manual only",
    "10. Live smoke: API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:maps",
    "11. Optional: EXPECT_LIVE=1 EXPECT_GOOGLE=1 EXPECT_AMAP=1 EXPECT_BAIDU=1 API_BASE_URL=… pnpm smoke:maps",
    "12. Prod: wrangler secret put GOOGLE_MAPS_SERVER_KEY / AMAP_SERVER_KEY / BAIDU_MAP_SERVER_KEY --env preview|production",
  ];
  for (const line of checklist) log(`  ${line}`);

  const keysDoc = resolve(repoRoot, "docs/keys-integration.md");
  const mapsDoc = resolve(repoRoot, "docs/maps-keys-smoke.md");
  const mapsSrc = resolve(root, "src/maps.ts");
  const factorySrc = resolve(repoRoot, "packages/core/src/map/factory.ts");
  const resolveSrc = resolve(repoRoot, "packages/core/src/map/resolve-engine.ts");
  const googleSrc = resolve(repoRoot, "packages/core/src/map/google.ts");
  const amapSrc = resolve(repoRoot, "packages/core/src/map/amap.ts");
  const baiduSrc = resolve(repoRoot, "packages/core/src/map/baidu.ts");
  const envExample = resolve(repoRoot, ".env.example");
  const devVars = resolve(repoRoot, "apps/api/.dev.vars.example");
  const indexSrc = resolve(root, "src/index.ts");

  for (const [label, path] of [
    ["docs/keys-integration.md", keysDoc],
    ["docs/maps-keys-smoke.md", mapsDoc],
    ["apps/api/src/maps.ts", mapsSrc],
    ["packages/core map factory", factorySrc],
    ["packages/core resolve-engine", resolveSrc],
    ["Google map engine", googleSrc],
    ["Amap map engine", amapSrc],
    ["Baidu map engine", baiduSrc],
    [".env.example", envExample],
    ["apps/api/.dev.vars.example", devVars],
    ["apps/api/src/index.ts", indexSrc],
  ]) {
    assert.ok(existsSync(path), `${label} missing: ${path}`);
  }

  const keys = readFileSync(keysDoc, "utf8");
  assert.match(keys, /GOOGLE_MAPS_SERVER_KEY/);
  assert.match(keys, /AMAP_SERVER_KEY/);
  assert.match(keys, /BAIDU_MAP_SERVER_KEY/);
  assert.match(keys, /DEFAULT_MAP_ENGINE=auto/);
  assert.match(keys, /smoke:maps/);

  const mapsRunbook = readFileSync(mapsDoc, "utf8");
  assert.match(mapsRunbook, /GOOGLE_MAPS_SERVER_KEY/);
  assert.match(mapsRunbook, /\/v1\/maps\/engine/);
  assert.match(mapsRunbook, /\/v1\/places\/search/);
  assert.match(mapsRunbook, /\/v1\/directions/);

  const maps = readFileSync(mapsSrc, "utf8");
  assert.match(maps, /\/v1\/maps\/engine/);
  assert.match(maps, /\/v1\/places\/search/);
  assert.match(maps, /\/v1\/directions/);
  assert.match(maps, /createEngineBundle/);

  const resolveEngine = readFileSync(resolveSrc, "utf8");
  assert.match(resolveEngine, /mainland_cn/);
  assert.match(resolveEngine, /Baidu/);
  assert.match(resolveEngine, /Auto never selects Baidu/);

  const factory = readFileSync(factorySrc, "utf8");
  assert.match(factory, /BaiduMapEngine/);
  assert.match(factory, /mode: "live"/);

  const health = readFileSync(indexSrc, "utf8");
  assert.match(health, /maps:\s*\{/);
  assert.match(health, /GOOGLE_MAPS_SERVER_KEY/);
  assert.match(health, /BAIDU_MAP_SERVER_KEY/);

  const env = readFileSync(envExample, "utf8");
  assert.match(env, /GOOGLE_MAPS_SERVER_KEY/);
  assert.match(env, /BAIDU_MAP_SERVER_KEY/);
  assert.match(env, /DEFAULT_MAP_ENGINE=auto/);

  const vars = readFileSync(devVars, "utf8");
  assert.match(vars, /AMAP_SERVER_KEY/);
  assert.match(vars, /DEFAULT_MAP_ENGINE=auto/);

  log("\nok dry-run (docs + Google/Amap/Baidu scaffolding present; no credentials used)");
  log("Hint: API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:maps");
  process.exit(0);
}

async function checkEnginePreference(label, query, expect) {
  const qs = new URLSearchParams(query);
  const { res, body } = await getJson(`${apiBase}/v1/maps/engine?${qs}`);
  if (!res.ok) fail(`${label}: HTTP ${res.status}`);
  for (const [key, value] of Object.entries(expect)) {
    if (body?.[key] !== value) {
      fail(`${label}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(body?.[key])}`);
    }
  }
  log(
    `${label}: ok (engineId=${body.engineId}, region=${body.region}, mode=${body.mode})`,
  );
  return body;
}

async function checkPlaces(engine, keyed) {
  const fix = ENGINE_FIXTURES[engine];
  const qs = new URLSearchParams({
    q: fix.q,
    engine,
    lat: String(fix.lat),
    lng: String(fix.lng),
    language: "zh-CN",
  });
  const { res, body } = await getJson(`${apiBase}/v1/places/search?${qs}`);
  if (!res.ok) {
    fail(`places ${engine}: HTTP ${res.status}${body?.error ? ` (${body.error})` : ""}`);
  }
  if (body?.engineId !== engine) {
    fail(`places ${engine}: expected engineId=${engine}, got ${body?.engineId}`);
  }
  if (!Array.isArray(body?.places) || body.places.length === 0) {
    fail(`places ${engine}: empty places array`);
  }
  const mode = body.mode;
  if (keyed && expectLive && mode !== "live") {
    fail(`places ${engine}: EXPECT_LIVE=1 but mode=${mode}`);
  }
  if (!keyed && mode !== "demo") {
    fail(`places ${engine}: no key flagged in /health but mode=${mode}`);
  }
  log(
    `places ${engine}: ok (mode=${mode}, n=${body.places.length}, sample=${body.places[0]?.name ?? "?"})`,
  );
  return body;
}

async function checkDirections(engine, keyed) {
  const fix = ENGINE_FIXTURES[engine];
  const { res, body } = await getJson(`${apiBase}/v1/directions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: fix.origin,
      destination: fix.destination,
      mode: "walk",
      engine,
      language: "zh-CN",
    }),
  });
  if (!res.ok) {
    fail(
      `directions ${engine}: HTTP ${res.status}${body?.error ? ` (${body.error})` : ""}`,
    );
  }
  if (body?.engineId !== engine) {
    fail(`directions ${engine}: expected engineId=${engine}, got ${body?.engineId}`);
  }
  if (!body?.route) {
    fail(`directions ${engine}: missing route`);
  }
  const mode = body.mode;
  if (keyed && expectLive && mode !== "live") {
    fail(`directions ${engine}: EXPECT_LIVE=1 but mode=${mode}`);
  }
  if (!keyed && mode !== "demo") {
    fail(`directions ${engine}: no key flagged in /health but mode=${mode}`);
  }
  const duration = body.route?.durationSec ?? body.route?.duration ?? "?";
  log(`directions ${engine}: ok (mode=${mode}, durationSec≈${duration})`);
  return body;
}

async function liveSmoke() {
  log("=== Beaver Plan — Maps keys smoke (live) ===");
  log(`API_BASE_URL=${apiBase}`);
  if (expectLive) log("EXPECT_LIVE=1");
  log("");

  let health;
  try {
    const { res, body } = await getJson(`${apiBase}/health`);
    if (!res.ok) fail(`/health HTTP ${res.status}`);
    health = body;
  } catch (err) {
    fail(`/health unreachable: ${err instanceof Error ? err.message : err}`);
  }

  const maps = health?.maps ?? {};
  log(`maps.google: ${Boolean(maps.google)}`);
  log(`maps.amap: ${Boolean(maps.amap)}`);
  log(`maps.baidu: ${Boolean(maps.baidu)}`);
  log(`maps.defaultEngine: ${maps.defaultEngine ?? "?"}`);
  log(`maps.autoAmapCn: ${Boolean(maps.autoAmapCn)}`);
  log("");

  if (expectGoogle && !maps.google) fail("EXPECT_GOOGLE=1 but maps.google is false");
  if (expectAmap && !maps.amap) fail("EXPECT_AMAP=1 but maps.amap is false");
  if (expectBaidu && !maps.baidu) fail("EXPECT_BAIDU=1 but maps.baidu is false");

  if (maps.defaultEngine && maps.defaultEngine !== "auto") {
    log(
      `note: DEFAULT_MAP_ENGINE=${maps.defaultEngine} (product default is auto; preference query still overrides)`,
    );
  }

  await checkEnginePreference(
    "auto + Asia/Shanghai",
    { preference: "auto", timezone: "Asia/Shanghai" },
    {
      engineId: maps.autoAmapCn === false ? "google" : "amap",
      region: maps.autoAmapCn === false ? "other" : "mainland_cn",
    },
  );
  await checkEnginePreference(
    "auto + America/Los_Angeles",
    { preference: "auto", timezone: "America/Los_Angeles" },
    { engineId: "google", region: "other" },
  );
  await checkEnginePreference(
    "preference=google (CN tz override)",
    { preference: "google", timezone: "Asia/Shanghai" },
    { engineId: "google" },
  );
  await checkEnginePreference(
    "preference=amap",
    { preference: "amap", timezone: "America/Los_Angeles" },
    { engineId: "amap" },
  );
  await checkEnginePreference(
    "preference=baidu (manual only)",
    { preference: "baidu", timezone: "Asia/Shanghai" },
    { engineId: "baidu" },
  );

  log("");
  for (const engine of /** @type {const} */ (["google", "amap", "baidu"])) {
    const keyed = Boolean(maps[engine]);
    await checkPlaces(engine, keyed);
    await checkDirections(engine, keyed);
    if (keyed) {
      log(`  → ${engine} key present; mode should be live (got above)`);
    } else {
      log(`  → ${engine} key absent; demo Places/Directions OK`);
    }
  }

  if (!maps.google && !maps.amap && !maps.baidu) {
    log(
      "\nHint: add GOOGLE_MAPS_SERVER_KEY / AMAP_SERVER_KEY / BAIDU_MAP_SERVER_KEY to apps/api/.dev.vars and restart API for live mode",
    );
  } else if (!expectLive) {
    log("\nHint: EXPECT_LIVE=1 to fail closed when a keyed engine stays in demo");
  }

  log("\nok maps keys live smoke");
  process.exit(0);
}

if (forceDry || !apiBase) {
  dryRun();
} else {
  liveSmoke().catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
