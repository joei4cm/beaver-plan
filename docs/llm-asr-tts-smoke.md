# LLM / ASR / TTS smoke — translation + day-fill (Michael runbook)

Live-integration step 5 (final). No secrets in chat or git — only local `.dev.vars` / Wrangler secrets.

Canonical env templates: [`.env.example`](../.env.example), [`apps/api/.dev.vars.example`](../apps/api/.dev.vars.example).  
Full keys checklist: [`keys-integration.md`](./keys-integration.md#5-openai--deepgram-or-edge-tts).

---

## 0. Dry-run (no secrets)

```bash
pnpm smoke:llm
# or: pnpm --filter @beaver/api smoke:llm -- --dry-run
```

Prints this checklist and verifies scaffolding (translation + day-fill routes, factories, env templates). Exits 0 without network.

---

## 1. Env vars (API only)

Secrets stay in **`apps/api/.dev.vars`** — never in Next / Expo bundles.

| Var | Purpose |
|-----|---------|
| `FEATURE_TRANSLATION=true` | Gate for `/v1/translation/*` (default on) |
| `OPENAI_API_KEY` | Chat translate + Whisper ASR + TTS + vision + **智能填天** propose |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible gateway |
| `OPENAI_CHAT_MODEL` | Default `gpt-4o-mini` |
| `OPENAI_ASR_MODEL` | Default `whisper-1` |
| `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` | Default `tts-1` / `alloy` |
| `DEEPGRAM_API_KEY` | Optional ASR (auto prefers Deepgram when set) |
| `ASR_PROVIDER` | `auto` \| `openai` \| `deepgram` \| `demo` |
| `LLM_PROVIDER` | `auto` \| `openai` \| `demo` (also day-fill) |
| `TTS_PROVIDER` | `auto` \| `openai` \| `edge` \| `demo` |

```bash
# apps/api/.dev.vars (values never committed)
FEATURE_TRANSLATION=true
OPENAI_API_KEY=…
# OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_ASR_MODEL=whisper-1
OPENAI_TTS_MODEL=tts-1
OPENAI_TTS_VOICE=alloy
# DEEPGRAM_API_KEY=…
ASR_PROVIDER=auto
LLM_PROVIDER=auto
TTS_PROVIDER=auto
```

**Rules**

- Missing `OPENAI_API_KEY` → translation + day-fill stay **`mode: "demo"`** (scripted bilingual turns / Kyoto catalog fill).
- `TTS_PROVIDER=edge` → server returns `speakLocally` (browser / device SpeechSynthesis).
- Day-fill **propose** needs Neon (`DATABASE_URL` + migrate) for `sample-kyoto`; status endpoints work without DB.
- Phrasebook + offline queue work with **no keys**.

Restart after every env change: `pnpm dev:api`.

---

## 2. Live smoke

```bash
pnpm dev:api   # http://127.0.0.1:8787

# Accepts demo or live per key presence:
API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:llm

# Fail closed when OpenAI should be live (Neon needed for day-fill propose):
EXPECT_LIVE=1 EXPECT_OPENAI=1 EXPECT_DAY_FILL=1 \
  API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:llm
```

| Check | Expect |
|-------|--------|
| `GET /health` | `translation.mode`, provider ids; `dayFill.mode` / `provider` |
| `GET /v1/translation/status` | `keys.openai` / `keys.deepgram` booleans; `streamingMode: "chunked"` |
| `GET /v1/translation/streaming` | Deepgram / OpenAI Realtime docs (no secrets) |
| `GET /v1/translation/phrasebook` | Non-empty travel phrases |
| `POST /v1/translation/turn` | `sourceText` + `translatedText`; demo or live |
| `POST /v1/translation/tts` | `audioBase64` and/or `speakLocally` |
| `GET /v1/day-fill/status` | `demo-day-fill` or `openai-day-fill` |
| `POST …/day-fill/propose` | Draft proposal when Neon is reachable; skipped on missing/unreachable DB (unless `EXPECT_DAY_FILL=1`) |

Manual curls (no secrets printed):

```bash
curl -s http://127.0.0.1:8787/health | jq '.translation,.dayFill'
curl -s http://127.0.0.1:8787/v1/translation/status | jq '.mode,.asr,.llm,.tts,.keys'
curl -s -X POST http://127.0.0.1:8787/v1/translation/turn \
  -H 'content-type: application/json' \
  -d '{"text":"你好","sourceLocale":"zh-CN","targetLocale":"en","withTts":false}'
curl -s http://127.0.0.1:8787/v1/day-fill/status | jq '.mode,.provider'
curl -s -X POST http://127.0.0.1:8787/v1/trips/sample-kyoto/day-fill/propose \
  -H 'content-type: application/json' -H 'X-Beaver-User-Id: demo-user' \
  -d '{"interests":["temples","food"],"maxWalkMinutesPerDay":60,"dayCount":3}'
```

UI: `/translate` (demo line / mic / typed); `/trips/sample-kyoto` → **智能填天**. Mobile → **实时翻译**.

---

## 3. Production (Wrangler)

```bash
cd apps/api
ENV=preview   # or production
pnpm exec wrangler secret put OPENAI_API_KEY --env "$ENV"
# pnpm exec wrangler secret put DEEPGRAM_API_KEY --env "$ENV"
# FEATURE_TRANSLATION / *_PROVIDER are non-secret vars in wrangler.toml when needed
pnpm --filter @beaver/api deploy:preview
API_BASE_URL=https://beaver-plan-api-preview.<subdomain>.workers.dev pnpm smoke:llm
```

---

## Pass matrix

| # | Command | Pass |
|---|---------|------|
| 1 | `pnpm smoke:llm` dry-run | exits 0 |
| 2 | `API_BASE_URL=… pnpm smoke:llm` without keys | status + demo turn + day-fill status OK; propose demo if Neon up |
| 3 | Same with `OPENAI_API_KEY` | `/health` / status `mode: live` (or mixed); turn + propose live |
| 4 | `EXPECT_LIVE=1 EXPECT_OPENAI=1` | fails if keyed stack stays demo |
