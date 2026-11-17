# Live keys integration checklist

Practical steps for Michael to turn on real Clerk, maps, Neon, R2, and translation providers. No secrets belong in git — only placeholders in `.env.example` / `apps/api/.dev.vars.example`.

**Prerequisites already on `main`:** Neon/Postgres (Drizzle) + R2 media via S3-compatible API.

---

## 0. Copy env templates

```bash
pnpm install
cp .env.example apps/web/.env.local
cp apps/api/.dev.vars.example apps/api/.dev.vars
# Mobile (Expo reads EXPO_PUBLIC_* from env / app config):
# copy the EXPO_PUBLIC_* lines into your shell or a local .env that Metro loads
```

| File | Used by |
|------|---------|
| `apps/web/.env.local` | Next.js (`NEXT_PUBLIC_*`, `CLERK_SECRET_KEY`) |
| `apps/api/.dev.vars` | Wrangler / Workers (`DATABASE_URL`, `S3_*`, map + LLM secrets) |
| Expo `EXPO_PUBLIC_*` | Mobile client only |

Restart `pnpm dev:api` / `pnpm dev:web` / `pnpm dev:mobile` after every env change.

---

## 1. Clerk (web + Expo) + WeChat

### Dashboard

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. Copy **Publishable key** (`pk_test_…` / `pk_live_…`) and **Secret key** (`sk_…`).
3. Note the Frontend API host (also encoded in the publishable key) — used as JWT issuer, e.g. `https://your-app.clerk.accounts.dev`.

### Web (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
CLERK_SECRET_KEY=sk_test_…
NEXT_PUBLIC_CLERK_WECHAT_ENABLED=false   # flip after WeChat is wired
```

### API (`apps/api/.dev.vars`)

```bash
CLERK_SECRET_KEY=sk_test_…              # enables JWT-gated trip mutations
CLERK_PUBLISHABLE_KEY=pk_test_…         # or set CLERK_JWT_ISSUER explicitly
# CLERK_JWT_ISSUER=https://your-app.clerk.accounts.dev
CLERK_WECHAT_ENABLED=false
PUBLIC_WEB_ORIGIN=http://localhost:3000
```

Without `CLERK_SECRET_KEY` on the API, trip mutations stay in **demo** mode (`X-Beaver-User-Id` → `demo-user`).

### Expo

```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
EXPO_PUBLIC_CLERK_WECHAT_ENABLED=false
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787
```

### WeChat social connection

WeChat credentials live in **Clerk + WeChat Open Platform**, not in this repo (no fake AppID/secret).

1. Clerk Dashboard → **User & Authentication → Social connections → WeChat**.
2. Paste WeChat Open Platform AppID / AppSecret into Clerk.
3. Copy Clerk’s callback URL into the WeChat open platform authorized redirect URIs.
4. Enable the connection in Clerk, then set:
   - `NEXT_PUBLIC_CLERK_WECHAT_ENABLED=true`
   - `EXPO_PUBLIC_CLERK_WECHAT_ENABLED=true`
   - `CLERK_WECHAT_ENABLED=true` (API `/health` → `auth.wechatUi: true`)
5. Web: open `/sign-in` — WeChat entry appears. Mobile: same flag surfaces the WeChat path.

### Smoke

| Check | Expect |
|-------|--------|
| No Clerk keys | `/health` → `auth.mode: "demo"`; planner works with demo headers |
| Keys set | `/health` → `auth.clerk: true`, `auth.mode: "clerk"` |
| Web signed in | Bearer JWT accepted on trip mutations; unsigned → 401 |
| WeChat flags on | UI shows WeChat entry; OAuth completes via Clerk |

---

## 2. Google Maps + Amap + Baidu (mainland auto-switch)

Server keys stay in **`apps/api/.dev.vars`** — never in client bundles.

```bash
# Google Maps Platform — enable Places API (New) + Routes API
GOOGLE_MAPS_SERVER_KEY=…

# 高德开放平台 — Web服务 key
AMAP_SERVER_KEY=…

# 百度地图开放平台 — Web服务 AK（Place v2 + DirectionLite）
BAIDU_MAP_SERVER_KEY=…

# Product rule: preference `auto` → Google outside CN, Amap in mainland CN
# Baidu is never chosen by auto — set trip mapEngine / preference to `baidu`.
DEFAULT_MAP_ENGINE=auto
MAP_AUTO_AMAP_CN=true

# Optional browser / native SDK keys (reserved; BFF is source of truth today)
# NEXT_PUBLIC_GOOGLE_MAPS_JS_KEY=
# NEXT_PUBLIC_AMAP_JS_KEY=
# NEXT_PUBLIC_BAIDU_MAP_JS_KEY=
# EXPO_PUBLIC_AMAP_KEY=
```

Region inference uses Cloudflare `CF-IPCountry`, then timezone (`Asia/Shanghai`…), then `Accept-Language: zh-CN`. Manual trip preference `google` / `amap` / `baidu` always wins over auto.

### Smoke — mainland auto-switch

```bash
# Outside CN heuristic → google
curl -s 'http://127.0.0.1:8787/v1/maps/engine?preference=auto&timezone=America/Los_Angeles'
# → engineId: "google", region: "other"

# Mainland heuristic → amap
curl -s 'http://127.0.0.1:8787/v1/maps/engine?preference=auto&timezone=Asia/Shanghai'
# → engineId: "amap", region: "mainland_cn"

# Override always wins
curl -s 'http://127.0.0.1:8787/v1/maps/engine?preference=google&timezone=Asia/Shanghai'
# → engineId: "google"

# Baidu is manual only
curl -s 'http://127.0.0.1:8787/v1/maps/engine?preference=baidu&timezone=Asia/Shanghai'
# → engineId: "baidu" (mode: "live" with BAIDU_MAP_SERVER_KEY, else "demo")
```

With live keys: Places search / directions should return `mode: "live"` (not demo POIs). Without keys: curated Kyoto / CN demo data still works.

`/health` → `maps.google` / `maps.amap` / `maps.baidu` booleans + `maps.defaultEngine` / `maps.autoAmapCn`.

### Baidu limits (vs Google / Amap)

| | Google | Amap | Baidu |
|--|--------|------|-------|
| Auto in mainland CN | no | yes | **no** (manual) |
| Coord system | WGS84 | GCJ-02 | **BD-09** |
| Coverage | global | CN-strong | CN-strong |
| Places / walk / drive / transit | yes | yes | yes (DirectionLite) |
| Web map tiles in planner | SVG stage (all engines) | same | same — no Baidu JS SDK tiles yet |

Do not mix PlaceRefs across engines without re-resolving — BD-09 vs GCJ-02 vs WGS84 will skew the SVG map.

---

## 3. Neon `DATABASE_URL` + migrate

Required for trips / journal metadata / members / invites / share artifacts. Missing → HTTP **503** (no memory fallback).

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. Copy the **pooled** (`-pooler`) connection string.
3. Put it in `apps/api/.dev.vars`:

```bash
DATABASE_URL=postgresql://user:password@ep-xxxx-pooler…/neondb?sslmode=require
```

4. Apply schema:

```bash
pnpm --filter @beaver/api db:migrate
# empty DB first time alternative: pnpm --filter @beaver/api db:push
```

5. Prod: `cd apps/api && pnpm exec wrangler secret put DATABASE_URL`

### Smoke

```bash
pnpm dev:api
curl -s http://127.0.0.1:8787/health | jq '.database'
# → configured: true
curl -s http://127.0.0.1:8787/v1/trips/sample-kyoto | jq '.trip.id,.days|length'
# → "sample-kyoto" + seeded days (idempotent seed on first DB request)
```

---

## 4. R2 S3 vars + CORS

Journal photos + share SVG objects use **Cloudflare R2** via the **S3-compatible API**. Neon stores object keys only.

```bash
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_BUCKET=beaver-plan-media
S3_REGION=auto
# Optional public CDN (skips signed GET):
# S3_PUBLIC_BASE_URL=https://media.example.com
```

`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` aliases are accepted.

### CORS (browser signed PUT)

In the R2 bucket CORS settings:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "http://127.0.0.1:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Without CORS, web journal falls back to `POST /v1/media` (still writes to R2). Mobile always uses the BFF upload path.

### Smoke

```bash
curl -s http://127.0.0.1:8787/health | jq '.media'
# → configured: true, storage: "s3"
```

Web: `/trips/sample-kyoto/journal` → demo photos load → upload a photo → save → Share studio export.

---

## 5. OpenAI / Deepgram (or Edge TTS)

Secrets in `apps/api/.dev.vars` only.

```bash
FEATURE_TRANSLATION=true
OPENAI_API_KEY=sk-…
# OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_ASR_MODEL=whisper-1
OPENAI_TTS_MODEL=tts-1
OPENAI_TTS_VOICE=alloy

# Optional Deepgram ASR
# DEEPGRAM_API_KEY=…
# ASR_PROVIDER=deepgram

ASR_PROVIDER=auto
LLM_PROVIDER=auto
TTS_PROVIDER=auto          # or edge = device/browser SpeechSynthesis
```

| Slot | `auto` | Explicit |
|------|--------|----------|
| LLM | OpenAI chat if key, else demo | `openai`, `demo` |
| ASR | Deepgram if key, else Whisper, else demo | `openai`, `deepgram`, `demo` |
| TTS | OpenAI speech if key, else edge/local | `openai`, `edge`, `demo` |
| Vision | OpenAI vision if key, else demo | (follows LLM key) |

### Streaming / lower-latency (optional)

No extra env vars required for the default **chunked** path (`POST /v1/translation/partial` + finalize `/turn`).

```bash
# Documented provider settings (safe — no secrets)
curl -s http://127.0.0.1:8787/v1/translation/streaming | jq '.mode,.deepgram,.openaiRealtime'

# Deepgram live WS (when DEEPGRAM_API_KEY set):
#   wss://api.deepgram.com/v1/listen?<listenQuery>
#   Header: Authorization: Token $DEEPGRAM_API_KEY
#   interim_results=true, endpointing=300

# OpenAI Realtime (when OPENAI_API_KEY set):
#   wss://api.openai.com/v1/realtime — mint ephemeral secret server-side first
#   Whisper (/audio/transcriptions) stays the batch finalizer for /turn
```

Primary travel locales (UI + API): `zh-CN`, `en`, `ja`, `ko`, `fr`, `es`, `de` (+ `th`/`vi`). Phrasebook works offline without keys.

### Smoke — demo → live

```bash
# Before keys
curl -s http://127.0.0.1:8787/v1/translation/status | jq '.mode,.streamingMode,.offlineAssist,.primaryLocales'
# → mode: "demo", streamingMode: "chunked", offlineAssist: "phrasebook"

# Phrasebook (no keys)
curl -s 'http://127.0.0.1:8787/v1/translation/phrasebook?sourceLocale=zh-CN&targetLocale=ja' | jq '.count,.phrases[0]'

# After OPENAI_API_KEY (+ restart API)
curl -s http://127.0.0.1:8787/v1/translation/status | jq '.mode,.asr,.llm,.tts'
# → mode: "live" (or mixed), providers not demo-*

curl -s -X POST http://127.0.0.1:8787/v1/translation/translate \
  -H 'content-type: application/json' \
  -d '{"text":"你好","sourceLocale":"zh-CN","targetLocale":"en"}'
```

UI: `http://localhost:3000/translate` — next-demo line, phrasebook, and offline queue still work without keys; mic shows chunked partials; typed line hits live providers when keyed. Mobile → **实时翻译**.

### Day-fill (智能填天) — same OpenAI key

Uses the same `OPENAI_*` / `LLM_PROVIDER` vars. No extra secret.

```bash
# Demo (no key)
curl -s http://127.0.0.1:8787/v1/day-fill/status | jq '.mode,.provider'
# → demo / demo-day-fill

curl -s -X POST http://127.0.0.1:8787/v1/trips/sample-kyoto/day-fill/propose \
  -H 'content-type: application/json' -H 'X-Beaver-User-Id: demo-user' \
  -d '{"interests":["temples","food"],"maxWalkMinutesPerDay":60,"dayCount":3}'

# Live (after OPENAI_API_KEY + restart)
curl -s http://127.0.0.1:8787/v1/day-fill/status | jq '.mode,.provider'
# → live / openai-day-fill
```

UI: `/trips/sample-kyoto` → **智能填天** → generate draft → preview → apply.

### OTA / booking stub (预订) — optional affiliate env

Deep links live on stops (`bookingLinks`: hotel / flight / ticket URL + provider label). Search is a **mock catalog** without keys; Amadeus / Booking affiliate vars are documented for a future live adapter (no fake secrets, no payment capture).

```bash
# Demo (no OTA keys)
curl -s http://127.0.0.1:8787/v1/booking/status | jq '.mode,.provider,.keys'
# → demo / demo-booking

curl -s -X POST http://127.0.0.1:8787/v1/booking/search \
  -H 'content-type: application/json' \
  -d '{"city":"Kyoto","checkIn":"2026-04-10","checkOut":"2026-04-12","kind":"all"}' \
  | jq '.mode,.suggestions[0]'

# Optional later (still mock catalog today — marks mode "configured"):
# AMADEUS_API_KEY=… AMADEUS_API_SECRET=…   # Amadeus self-service
# BOOKING_AFFILIATE_ID=…                   # Booking.com affiliate aid
# OTA_PROVIDER=auto|demo|amadeus|booking
```

UI: `/trips/sample-kyoto` → select a stop → **预订** panel → save links / open external / apply a suggestion. Mobile trip detail shows booking chips and opens URLs externally.

Neon: run `pnpm --filter @beaver/api db:migrate` for `stops.booking_links` (`0002_stop_booking_links`).

---

## 6. End-to-end smoke matrix

Run with Neon + R2 at minimum; add Clerk / maps / LLM as you enable them.

| # | Surface | Command / UI | Pass criteria |
|---|---------|--------------|---------------|
| 1 | Health | `GET /health` | `database.configured`, `media.configured`; auth/maps/translation flags match env |
| 2 | Sample trip | `GET /v1/trips/sample-kyoto` | Seeded Kyoto days/stops/members |
| 3 | Planner | Web `/trips/sample-kyoto` | Map + stops render |
| 4 | Maps engine | `GET /v1/maps/engine?preference=auto&timezone=Asia/Shanghai` | `engineId: "amap"` when `MAP_AUTO_AMAP_CN=true` |
| 5 | Journal upload | Web journal → photo → save | Object in R2; Neon entry has media key; `GET /v1/media/:id` redirects/streams |
| 6 | Share | Share studio → export | Card generates; SVG may persist under `share/…` |
| 7 | Translate demo | `/translate` without LLM keys | Scripted bilingual turns |
| 8 | Translate live | Same UI / `POST /v1/translation/translate` with keys | `mode: "live"`; non-demo providers |
| 9 | Day-fill demo | `/trips/sample-kyoto` 智能填天 without key | Draft preview; apply updates days/stops |
| 10 | Day-fill live | Same + `OPENAI_API_KEY` | `dayFill.mode: "live"`; LLM propose |
| 11 | Booking demo | `POST /v1/booking/search` + planner 预订 | Suggestions; save stop `bookingLinks`; open external |
| 12 | Clerk | Sign-in + mutate trip | JWT required; WeChat entry when flags on |
| 13 | Mobile | Expo itinerary / journal / translate / booking chips | Hits same API base URL |

---

## 7. Production (Cloudflare Workers)

Canonical deploy scaffold (envs, dry-run, secrets list, Pages/OpenNext): [`deploy-cloudflare.md`](./deploy-cloudflare.md).

```bash
cd apps/api
ENV=production   # or preview
pnpm exec wrangler secret put DATABASE_URL --env "$ENV"
pnpm exec wrangler secret put S3_ACCESS_KEY_ID --env "$ENV"
pnpm exec wrangler secret put S3_SECRET_ACCESS_KEY --env "$ENV"
# also: S3_ENDPOINT or R2_ACCOUNT_ID, S3_BUCKET, S3_REGION=auto
pnpm exec wrangler secret put CLERK_SECRET_KEY --env "$ENV"
pnpm exec wrangler secret put GOOGLE_MAPS_SERVER_KEY --env "$ENV"
pnpm exec wrangler secret put AMAP_SERVER_KEY --env "$ENV"
pnpm exec wrangler secret put BAIDU_MAP_SERVER_KEY --env "$ENV"
pnpm exec wrangler secret put OPENAI_API_KEY --env "$ENV"
# optional: DEEPGRAM_API_KEY, CLERK_JWT_ISSUER, …
pnpm --filter @beaver/api db:migrate   # same Neon DB
pnpm --filter @beaver/api deploy:production   # or deploy:preview
pnpm exec wrangler secret list --env "$ENV"
```

Update R2 CORS `AllowedOrigins` for the real web origin. Set `PUBLIC_WEB_ORIGIN` in `wrangler.toml` `[env.*.vars]` to the production web URL, then redeploy.

---

## Var index (no secrets)

Authoritative templates: root [`.env.example`](../.env.example) and [`apps/api/.dev.vars.example`](../apps/api/.dev.vars.example).

| Area | Vars |
|------|------|
| Clerk web | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_WECHAT_ENABLED` |
| Clerk API | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` / `CLERK_JWT_ISSUER`, `CLERK_WECHAT_ENABLED`, `PUBLIC_WEB_ORIGIN` |
| Clerk Expo | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CLERK_WECHAT_ENABLED` |
| API base | `NEXT_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_API_BASE_URL` |
| Neon | `DATABASE_URL` |
| R2 / S3 | `S3_ENDPOINT` or `R2_ACCOUNT_ID`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION`, optional `S3_PUBLIC_BASE_URL` (+ `R2_*` aliases) |
| Maps | `GOOGLE_MAPS_SERVER_KEY`, `AMAP_SERVER_KEY`, `BAIDU_MAP_SERVER_KEY`, `DEFAULT_MAP_ENGINE`, `MAP_AUTO_AMAP_CN` |
| Translation | `FEATURE_TRANSLATION`, `OPENAI_*`, `DEEPGRAM_API_KEY`, `ASR_PROVIDER`, `LLM_PROVIDER`, `TTS_PROVIDER` |
| Day-fill | same `OPENAI_*` + `LLM_PROVIDER` (demo when key unset) |
| OTA / booking | `OTA_PROVIDER`, `AMADEUS_API_KEY`, `AMADEUS_API_SECRET`, `BOOKING_AFFILIATE_ID` (demo search without keys; live adapter later) |
