#!/usr/bin/env node
/**
 * Clerk + WeChat operator smoke.
 *
 * Dry-run (default when API_BASE_URL unset, or --dry-run / BEAVER_SMOKE_DRY=1):
 *   - No credentials required — safe for CI.
 *   - Prints Michael's runbook checklist and verifies scaffolding files.
 *
 * Live (API_BASE_URL set):
 *   - GET /health → auth.mode / auth.clerk / auth.jwtIssuerConfigured / auth.wechatUi
 *   - Optional unsigned trip mutation expectation when auth.mode=clerk (401)
 *   - Optional CLERK_SMOKE_JWT → Bearer accepted on a read/membership probe
 *   - Optional WEB_BASE_URL → GET /sign-in returns 200
 *
 * Env:
 *   API_BASE_URL       e.g. http://127.0.0.1:8787
 *   WEB_BASE_URL       e.g. http://localhost:3000  (optional sign-in route check)
 *   CLERK_SMOKE_JWT    optional Clerk session JWT (never print value)
 *   EXPECT_CLERK=1     fail if auth.mode !== "clerk"
 *   EXPECT_WECHAT=1    fail if auth.wechatUi !== true
 *   BEAVER_SMOKE_DRY=1 force dry-run
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
const webBase = (process.env.WEB_BASE_URL ?? "").trim().replace(/\/$/, "");
const smokeJwt = (process.env.CLERK_SMOKE_JWT ?? "").trim();
const expectClerk = process.env.EXPECT_CLERK === "1";
const expectWechat = process.env.EXPECT_WECHAT === "1";

function log(msg) {
  console.log(msg);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function dryRun() {
  log("=== Beaver Plan — Clerk + WeChat smoke (dry-run) ===");
  log("No live credentials required. Operator checklist (Michael):\n");

  const checklist = [
    "1. Clerk Dashboard: create app → copy pk_test_/pk_live_ + sk_ keys",
    "2. Web: apps/web/.env.local → NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY",
    "3. API: apps/api/.dev.vars → CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY (or CLERK_JWT_ISSUER)",
    "4. Expo (optional): EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY (+ EXPO_PUBLIC_API_BASE_URL)",
    "5. WeChat: Clerk → Social connections → WeChat → paste Open Platform AppID/Secret",
    "6. Copy Clerk callback URL into WeChat Open Platform authorized redirect URIs",
    "7. Flip flags: NEXT_PUBLIC_CLERK_WECHAT_ENABLED=true, EXPO_PUBLIC_CLERK_WECHAT_ENABLED=true, CLERK_WECHAT_ENABLED=true",
    "8. Restart pnpm dev:api / dev:web / dev:mobile",
    "9. Verify: GET /health → auth.mode=clerk, auth.jwtIssuerConfigured=true",
    "10. Web: open /sign-in (Clerk panel); /sign-in?strategy=oauth_wechat starts WeChat",
    "11. Mobile: open /sign-in → WeChat button when Expo WeChat flag is on",
    "12. Live smoke: API_BASE_URL=http://127.0.0.1:8787 WEB_BASE_URL=http://localhost:3000 pnpm smoke:clerk",
    "13. Optional JWT probe: CLERK_SMOKE_JWT=<session jwt> API_BASE_URL=… pnpm smoke:clerk",
  ];
  for (const line of checklist) log(`  ${line}`);

  const keysDoc = resolve(repoRoot, "docs/keys-integration.md");
  const clerkDoc = resolve(repoRoot, "docs/clerk-wechat-smoke.md");
  const authSrc = resolve(root, "src/auth.ts");
  const webClerk = resolve(repoRoot, "apps/web/src/lib/clerk.ts");
  const webSignIn = resolve(
    repoRoot,
    "apps/web/src/app/sign-in/[[...sign-in]]/page.tsx",
  );
  const wechatTrigger = resolve(
    repoRoot,
    "apps/web/src/components/auth/wechat-oauth-trigger.tsx",
  );
  const mobileClerk = resolve(repoRoot, "apps/mobile/src/clerk.ts");
  const mobileSignIn = resolve(repoRoot, "apps/mobile/app/sign-in.tsx");
  const envExample = resolve(repoRoot, ".env.example");
  const devVars = resolve(repoRoot, "apps/api/.dev.vars.example");

  for (const [label, path] of [
    ["docs/keys-integration.md", keysDoc],
    ["docs/clerk-wechat-smoke.md", clerkDoc],
    ["apps/api/src/auth.ts", authSrc],
    ["apps/web/src/lib/clerk.ts", webClerk],
    ["apps/web sign-in page", webSignIn],
    ["wechat-oauth-trigger", wechatTrigger],
    ["apps/mobile/src/clerk.ts", mobileClerk],
    ["apps/mobile/app/sign-in.tsx", mobileSignIn],
    [".env.example", envExample],
    ["apps/api/.dev.vars.example", devVars],
  ]) {
    assert.ok(existsSync(path), `${label} missing: ${path}`);
  }

  const keys = readFileSync(keysDoc, "utf8");
  assert.match(keys, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.match(keys, /CLERK_SECRET_KEY/);
  assert.match(keys, /WeChat/);
  assert.match(keys, /smoke:clerk/);

  const clerkRunbook = readFileSync(clerkDoc, "utf8");
  assert.match(clerkRunbook, /oauth_wechat/);
  assert.match(clerkRunbook, /CLERK_JWT_ISSUER|CLERK_PUBLISHABLE_KEY/);

  const auth = readFileSync(authSrc, "utf8");
  assert.match(auth, /clerkConfigured/);
  assert.match(auth, /clerkIssuer/);
  assert.match(auth, /clerkSecretConfigured/);

  const trigger = readFileSync(wechatTrigger, "utf8");
  assert.match(trigger, /oauth_wechat/);
  assert.match(trigger, /authenticateWithRedirect/);

  const mobile = readFileSync(mobileSignIn, "utf8");
  assert.match(mobile, /oauth_wechat/);
  assert.match(mobile, /wechatLoginEnabled/);

  const env = readFileSync(envExample, "utf8");
  assert.match(env, /EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.match(env, /CLERK_WECHAT_ENABLED/);

  log("\nok dry-run (docs + Clerk/WeChat scaffolding present; no credentials used)");
  log(
    "Hint: API_BASE_URL=http://127.0.0.1:8787 WEB_BASE_URL=http://localhost:3000 pnpm smoke:clerk",
  );
  process.exit(0);
}

async function liveSmoke() {
  log("=== Beaver Plan — Clerk + WeChat smoke (live) ===");
  log(`API_BASE_URL=${apiBase}`);
  if (webBase) log(`WEB_BASE_URL=${webBase}`);
  if (smokeJwt) log("CLERK_SMOKE_JWT: set (value hidden)");
  log("");

  let health;
  try {
    const res = await fetch(`${apiBase}/health`);
    if (!res.ok) fail(`/health HTTP ${res.status}`);
    health = await res.json();
  } catch (err) {
    fail(`/health unreachable: ${err instanceof Error ? err.message : err}`);
  }

  const auth = health?.auth ?? {};
  log(`auth.mode: ${auth.mode ?? "?"}`);
  log(`auth.clerk: ${Boolean(auth.clerk)}`);
  log(`auth.secretConfigured: ${Boolean(auth.secretConfigured)}`);
  log(`auth.jwtIssuerConfigured: ${Boolean(auth.jwtIssuerConfigured)}`);
  log(`auth.wechatUi: ${Boolean(auth.wechatUi)}`);
  if (auth.note) log(`auth.note: ${auth.note}`);

  if (expectClerk && auth.mode !== "clerk") {
    fail('EXPECT_CLERK=1 but auth.mode is not "clerk"');
  }
  if (expectWechat && !auth.wechatUi) {
    fail("EXPECT_WECHAT=1 but auth.wechatUi is false");
  }

  if (auth.secretConfigured && !auth.jwtIssuerConfigured) {
    fail(
      "CLERK_SECRET_KEY present but JWT issuer missing — set CLERK_PUBLISHABLE_KEY or CLERK_JWT_ISSUER",
    );
  }

  // Demo mode: unsigned demo header should still be accepted for membership reads.
  if (auth.mode === "demo") {
    try {
      const res = await fetch(`${apiBase}/v1/trips/sample-kyoto/members`, {
        headers: { "X-Beaver-User-Id": "demo-user" },
      });
      if (!res.ok) {
        fail(
          `demo members read → HTTP ${res.status} (expected demo identity to work)`,
        );
      }
      log("demo identity: ok (sample-kyoto members with X-Beaver-User-Id)");
    } catch (err) {
      fail(`demo identity: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Clerk mode: unsigned mutation/membership write path should 401.
  if (auth.mode === "clerk") {
    try {
      const res = await fetch(`${apiBase}/v1/trips/sample-kyoto/invites`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Beaver-User-Id": "demo-user",
        },
        body: JSON.stringify({ role: "viewer" }),
      });
      if (res.status !== 401) {
        fail(
          `clerk mode unsigned invite → HTTP ${res.status} (expected 401 without Bearer JWT)`,
        );
      }
      log("clerk gate: ok (unsigned invite → 401)");
    } catch (err) {
      fail(`clerk gate: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (smokeJwt) {
    if (auth.mode !== "clerk") {
      fail("CLERK_SMOKE_JWT set but API auth.mode is not clerk");
    }
    try {
      const res = await fetch(`${apiBase}/v1/trips/sample-kyoto/members`, {
        headers: { Authorization: `Bearer ${smokeJwt}` },
      });
      if (res.status === 401) {
        fail("CLERK_SMOKE_JWT rejected (401) — check issuer / token freshness");
      }
      if (!res.ok) {
        fail(`Bearer members read → HTTP ${res.status}`);
      }
      log("Bearer JWT: ok (sample-kyoto members)");
    } catch (err) {
      fail(`Bearer JWT: ${err instanceof Error ? err.message : err}`);
    }
  } else if (auth.mode === "clerk") {
    log(
      "Hint: set CLERK_SMOKE_JWT to a Clerk session JWT to verify Bearer acceptance",
    );
  }

  if (webBase) {
    try {
      const res = await fetch(`${webBase}/sign-in`, {
        redirect: "manual",
        headers: { Accept: "text/html" },
      });
      // 200 OK, or 307/308 from middleware still means route is wired.
      if (res.status >= 400) {
        fail(`GET ${webBase}/sign-in → HTTP ${res.status}`);
      }
      log(`web /sign-in: ok (HTTP ${res.status})`);
    } catch (err) {
      fail(`web /sign-in: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    log("Hint: set WEB_BASE_URL=http://localhost:3000 to verify /sign-in");
  }

  log("\nok clerk + wechat live smoke");
  process.exit(0);
}

if (forceDry || !apiBase) {
  dryRun();
} else {
  liveSmoke().catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
