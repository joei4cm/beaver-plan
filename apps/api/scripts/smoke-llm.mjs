#!/usr/bin/env node
/**
 * LLM / ASR / TTS operator smoke (translation + day-fill).
 *
 * Dry-run (default when API_BASE_URL unset, or --dry-run / BEAVER_SMOKE_DRY=1):
 *   - No credentials required — safe for CI.
 *   - Prints Michael's runbook checklist and verifies scaffolding files.
 *
 * Live (API_BASE_URL set):
 *   - GET /health → translation + dayFill capability flags
 *   - GET /v1/translation/status (+ streaming, phrasebook)
 *   - POST /v1/translation/turn (typed demo / live text; TTS optional)
 *   - GET /v1/day-fill/status
 *   - POST /v1/trips/sample-kyoto/day-fill/propose when database.configured
 *
 * Env:
 *   API_BASE_URL           e.g. http://127.0.0.1:8787
 *   EXPECT_LIVE=1          fail if translation.mode or dayFill.mode is still demo when OpenAI key flagged
 *   EXPECT_OPENAI=1        fail if /health|/status keys.openai is false
 *   EXPECT_DEEPGRAM=1      fail if translation status keys.deepgram is false
 *   EXPECT_DAY_FILL=1      fail if day-fill propose is skipped (needs Neon)
 *   BEAVER_SMOKE_DRY=1     force dry-run
 *   SKIP_TTS=1             skip /translation/tts probe
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
const expectOpenai = process.env.EXPECT_OPENAI === "1";
const expectDeepgram = process.env.EXPECT_DEEPGRAM === "1";
const expectDayFill = process.env.EXPECT_DAY_FILL === "1";
const skipTts = process.env.SKIP_TTS === "1";

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
  log("=== Beaver Plan — LLM / ASR / TTS smoke (dry-run) ===");
  log("No live credentials required. Operator checklist (Michael):\n");

  const checklist = [
    "1. OpenAI (compatible): create key → OPENAI_API_KEY (chat + Whisper ASR + TTS + vision + day-fill)",
    "2. Optional Deepgram ASR: DEEPGRAM_API_KEY (+ ASR_PROVIDER=deepgram or auto)",
    "3. API: apps/api/.dev.vars → FEATURE_TRANSLATION=true, OPENAI_*, ASR/LLM/TTS_PROVIDER=auto",
    "4. Models (safe defaults): OPENAI_CHAT_MODEL=gpt-4o-mini, OPENAI_ASR_MODEL=whisper-1, OPENAI_TTS_MODEL=tts-1, OPENAI_TTS_VOICE=alloy",
    "5. Optional: OPENAI_BASE_URL for OpenAI-compatible gateways",
    "6. TTS_PROVIDER=edge forces browser/device SpeechSynthesis (no server audio bytes)",
    "7. Restart pnpm dev:api (Wrangler reloads .dev.vars)",
    "8. Verify: GET /health → translation.mode + dayFill.mode (demo without key, live with OpenAI)",
    "9. Translate: GET /v1/translation/status; POST /v1/translation/turn with typed text",
    "10. Day-fill: GET /v1/day-fill/status; POST /v1/trips/sample-kyoto/day-fill/propose (needs Neon)",
    "11. Live smoke: API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:llm",
    "12. Optional: EXPECT_LIVE=1 EXPECT_OPENAI=1 API_BASE_URL=… pnpm smoke:llm",
    "13. Prod: wrangler secret put OPENAI_API_KEY [-- DEEPGRAM_API_KEY] --env preview|production",
  ];
  for (const line of checklist) log(`  ${line}`);

  const keysDoc = resolve(repoRoot, "docs/keys-integration.md");
  const llmDoc = resolve(repoRoot, "docs/llm-asr-tts-smoke.md");
  const translationSrc = resolve(root, "src/translation.ts");
  const dayFillSrc = resolve(root, "src/day-fill.ts");
  const indexSrc = resolve(root, "src/index.ts");
  const envSrc = resolve(root, "src/env.ts");
  const factorySrc = resolve(repoRoot, "packages/core/src/translation/factory.ts");
  const dayFillFactory = resolve(repoRoot, "packages/core/src/day-fill/factory.ts");
  const pipelineSrc = resolve(repoRoot, "packages/core/src/translation/pipeline.ts");
  const envExample = resolve(repoRoot, ".env.example");
  const devVars = resolve(repoRoot, "apps/api/.dev.vars.example");

  for (const [label, path] of [
    ["docs/keys-integration.md", keysDoc],
    ["docs/llm-asr-tts-smoke.md", llmDoc],
    ["apps/api/src/translation.ts", translationSrc],
    ["apps/api/src/day-fill.ts", dayFillSrc],
    ["apps/api/src/index.ts", indexSrc],
    ["apps/api/src/env.ts", envSrc],
    ["packages/core translation factory", factorySrc],
    ["packages/core day-fill factory", dayFillFactory],
    ["packages/core translation pipeline", pipelineSrc],
    [".env.example", envExample],
    ["apps/api/.dev.vars.example", devVars],
  ]) {
    assert.ok(existsSync(path), `${label} missing: ${path}`);
  }

  const keys = readFileSync(keysDoc, "utf8");
  assert.match(keys, /OPENAI_API_KEY/);
  assert.match(keys, /DEEPGRAM_API_KEY/);
  assert.match(keys, /ASR_PROVIDER/);
  assert.match(keys, /LLM_PROVIDER/);
  assert.match(keys, /TTS_PROVIDER/);
  assert.match(keys, /smoke:llm/);
  assert.match(keys, /day-fill\/propose/);

  const llmRunbook = readFileSync(llmDoc, "utf8");
  assert.match(llmRunbook, /OPENAI_API_KEY/);
  assert.match(llmRunbook, /\/v1\/translation\/status/);
  assert.match(llmRunbook, /\/v1\/translation\/turn/);
  assert.match(llmRunbook, /\/v1\/day-fill\/status/);
  assert.match(llmRunbook, /day-fill\/propose/);

  const translation = readFileSync(translationSrc, "utf8");
  assert.match(translation, /\/v1\/translation\/status/);
  assert.match(translation, /\/v1\/translation\/turn/);
  assert.match(translation, /createTranslationStack/);
  assert.match(translation, /DEEPGRAM_API_KEY/);

  const dayFill = readFileSync(dayFillSrc, "utf8");
  assert.match(dayFill, /\/v1\/day-fill\/status/);
  assert.match(dayFill, /day-fill\/propose/);
  assert.match(dayFill, /createDayFillStack/);

  const health = readFileSync(indexSrc, "utf8");
  assert.match(health, /translation/);
  assert.match(health, /dayFill/);
  assert.match(health, /OPENAI_API_KEY/);

  const envTs = readFileSync(envSrc, "utf8");
  assert.match(envTs, /OPENAI_API_KEY/);
  assert.match(envTs, /DEEPGRAM_API_KEY/);
  assert.match(envTs, /ASR_PROVIDER/);
  assert.match(envTs, /TTS_PROVIDER/);

  const factory = readFileSync(factorySrc, "utf8");
  assert.match(factory, /createTranslationStack/);
  assert.match(factory, /reportTranslationCapabilities/);

  const dfFactory = readFileSync(dayFillFactory, "utf8");
  assert.match(dfFactory, /createDayFillStack/);
  assert.match(dfFactory, /demo-day-fill|mode: "demo"/);

  const env = readFileSync(envExample, "utf8");
  assert.match(env, /OPENAI_API_KEY=/);
  assert.match(env, /DEEPGRAM_API_KEY=/);
  assert.match(env, /ASR_PROVIDER=auto/);
  assert.match(env, /LLM_PROVIDER=auto/);
  assert.match(env, /TTS_PROVIDER=auto/);

  const vars = readFileSync(devVars, "utf8");
  assert.match(vars, /OPENAI_API_KEY=/);
  assert.match(vars, /DEEPGRAM_API_KEY=/);
  assert.match(vars, /FEATURE_TRANSLATION=true/);
  assert.match(vars, /ASR_PROVIDER=auto/);

  log("\nok dry-run (docs + translation/day-fill scaffolding present; no credentials used)");
  log("Hint: API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:llm");
  process.exit(0);
}

async function liveSmoke() {
  log("=== Beaver Plan — LLM / ASR / TTS smoke (live) ===");
  log(`API_BASE_URL=${apiBase}`);
  if (expectLive) log("EXPECT_LIVE=1");
  if (expectOpenai) log("EXPECT_OPENAI=1");
  if (expectDeepgram) log("EXPECT_DEEPGRAM=1");
  log("");

  let health;
  try {
    const { res, body } = await getJson(`${apiBase}/health`);
    if (!res.ok) fail(`/health HTTP ${res.status}`);
    health = body;
  } catch (err) {
    fail(`/health unreachable: ${err instanceof Error ? err.message : err}`);
  }

  const translation = health?.translation ?? {};
  const dayFill = health?.dayFill ?? {};
  const dbConfigured = Boolean(health?.database?.configured);

  log(`translation.mode: ${translation.mode ?? "?"}`);
  log(`translation.asr/llm/tts: ${translation.asr ?? "?"} / ${translation.llm ?? "?"} / ${translation.tts ?? "?"}`);
  log(`translation.featureEnabled: ${Boolean(translation.featureEnabled)}`);
  log(`dayFill.mode: ${dayFill.mode ?? "?"} provider=${dayFill.provider ?? "?"}`);
  log(`database.configured: ${dbConfigured}`);
  log("");

  if (!translation.featureEnabled) {
    fail("FEATURE_TRANSLATION appears disabled (translation.featureEnabled=false)");
  }

  const { res: statusRes, body: status } = await getJson(
    `${apiBase}/v1/translation/status`,
  );
  if (!statusRes.ok) fail(`/v1/translation/status HTTP ${statusRes.status}`);

  const openaiKeyed = Boolean(status?.keys?.openai);
  const deepgramKeyed = Boolean(status?.keys?.deepgram);
  log(
    `translation/status: mode=${status.mode}, keys.openai=${openaiKeyed}, keys.deepgram=${deepgramKeyed}`,
  );
  log(
    `  providers: asr=${status.asr}, llm=${status.llm}, tts=${status.tts}, streamingMode=${status.streamingMode}`,
  );

  if (expectOpenai && !openaiKeyed) {
    fail("EXPECT_OPENAI=1 but keys.openai is false");
  }
  if (expectDeepgram && !deepgramKeyed) {
    fail("EXPECT_DEEPGRAM=1 but keys.deepgram is false");
  }
  if (expectLive && openaiKeyed && status.mode === "demo") {
    fail("EXPECT_LIVE=1 and OpenAI key present but translation.mode=demo");
  }
  if (!openaiKeyed && status.mode !== "demo") {
    fail(`no OpenAI key flagged but translation.mode=${status.mode}`);
  }

  const { res: streamRes, body: streaming } = await getJson(
    `${apiBase}/v1/translation/streaming`,
  );
  if (!streamRes.ok) fail(`/v1/translation/streaming HTTP ${streamRes.status}`);
  if (!streaming?.notes?.chunked) {
    fail("translation/streaming: missing notes.chunked");
  }
  log(
    `translation/streaming: ok (mode=${streaming.mode ?? "?"}; deepgram=${Boolean(streaming.deepgram)}; openaiRealtime=${Boolean(streaming.openaiRealtime)})`,
  );

  const { res: phraseRes, body: phrasebook } = await getJson(
    `${apiBase}/v1/translation/phrasebook?sourceLocale=zh-CN&targetLocale=ja`,
  );
  if (!phraseRes.ok) {
    fail(`/v1/translation/phrasebook HTTP ${phraseRes.status}`);
  }
  if (!Array.isArray(phrasebook?.phrases) || phrasebook.phrases.length === 0) {
    fail("phrasebook: empty phrases");
  }
  log(
    `phrasebook zh-CN→ja: ok (count=${phrasebook.count ?? phrasebook.phrases.length})`,
  );

  const turnPayload = {
    text: "你好",
    sourceLocale: "zh-CN",
    targetLocale: "en",
    withTts: false,
    demoTurnIndex: 0,
  };
  const { res: turnRes, body: turn } = await getJson(
    `${apiBase}/v1/translation/turn`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(turnPayload),
    },
  );
  if (!turnRes.ok) {
    fail(
      `translation/turn HTTP ${turnRes.status}${turn?.error ? ` (${turn.error})` : ""}`,
    );
  }
  if (!turn?.translatedText && !turn?.sourceText) {
    fail("translation/turn: missing sourceText/translatedText");
  }
  if (expectLive && openaiKeyed && turn.mode === "demo") {
    fail("EXPECT_LIVE=1 but turn.mode=demo with OpenAI key");
  }
  log(
    `translation/turn: ok (mode=${turn.mode}, translate=${turn.translateProvider ?? "?"}, src="${String(turn.sourceText ?? "").slice(0, 40)}", out="${String(turn.translatedText ?? "").slice(0, 40)}")`,
  );

  if (!skipTts) {
    const { res: ttsRes, body: tts } = await getJson(
      `${apiBase}/v1/translation/tts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Hello Kyoto", locale: "en" }),
      },
    );
    if (!ttsRes.ok) {
      fail(
        `translation/tts HTTP ${ttsRes.status}${tts?.error ? ` (${tts.error})` : ""}`,
      );
    }
    const hasAudio = Boolean(tts?.audioBase64);
    const speakLocally = Boolean(tts?.speakLocally);
    if (!hasAudio && !speakLocally) {
      fail("translation/tts: expected audioBase64 or speakLocally");
    }
    log(
      `translation/tts: ok (provider=${tts.provider ?? "?"}, speakLocally=${speakLocally}, audio=${hasAudio})`,
    );
  }

  const { res: dfStatusRes, body: dfStatus } = await getJson(
    `${apiBase}/v1/day-fill/status`,
  );
  if (!dfStatusRes.ok) fail(`/v1/day-fill/status HTTP ${dfStatusRes.status}`);
  log(
    `day-fill/status: mode=${dfStatus.mode}, provider=${dfStatus.provider}, keys.openai=${Boolean(dfStatus.keys?.openai)}`,
  );

  if (expectLive && openaiKeyed && dfStatus.mode === "demo") {
    fail("EXPECT_LIVE=1 and OpenAI key present but dayFill.mode=demo");
  }
  if (!openaiKeyed && dfStatus.mode !== "demo") {
    fail(`no OpenAI key but dayFill.mode=${dfStatus.mode}`);
  }

  if (!dbConfigured) {
    const msg =
      "day-fill/propose skipped — database.configured=false (set DATABASE_URL + migrate for sample-kyoto)";
    if (expectDayFill) fail(msg);
    log(`\nnote: ${msg}`);
  } else {
    const { res: proposeRes, body: propose } = await getJson(
      `${apiBase}/v1/trips/sample-kyoto/day-fill/propose`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Beaver-User-Id": "demo-user",
        },
        body: JSON.stringify({
          interests: ["temples", "food"],
          maxWalkMinutesPerDay: 60,
          dayCount: 3,
        }),
      },
    );
    // Placeholder DATABASE_URL can flip health.configured without a reachable Neon.
    if (
      proposeRes.status === 503 &&
      (propose?.error === "database_unavailable" ||
        propose?.error === "database_required" ||
        String(propose?.error ?? "").includes("database"))
    ) {
      const msg = `day-fill/propose skipped — Neon unreachable (${propose?.error ?? "503"})`;
      if (expectDayFill) fail(msg);
      log(`\nnote: ${msg}`);
    } else if (!proposeRes.ok) {
      fail(
        `day-fill/propose HTTP ${proposeRes.status}${propose?.error ? ` (${propose.error})` : ""}`,
      );
    } else {
      if (!propose?.proposal?.days || !Array.isArray(propose.proposal.days)) {
        fail("day-fill/propose: missing proposal.days");
      }
      if (expectLive && openaiKeyed && propose.mode === "demo") {
        fail("EXPECT_LIVE=1 but day-fill propose mode=demo with OpenAI key");
      }
      log(
        `day-fill/propose: ok (mode=${propose.mode}, provider=${propose.provider}, days=${propose.proposal.days.length}, draft=${Boolean(propose.draft)})`,
      );
    }
  }

  if (!openaiKeyed && !deepgramKeyed) {
    log(
      "\nHint: add OPENAI_API_KEY (and optional DEEPGRAM_API_KEY) to apps/api/.dev.vars and restart API for live mode",
    );
  } else if (!expectLive) {
    log("\nHint: EXPECT_LIVE=1 to fail closed when keyed providers stay in demo");
  }

  log("\nok LLM / ASR / TTS live smoke");
  process.exit(0);
}

if (forceDry || !apiBase) {
  dryRun();
} else {
  liveSmoke().catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
