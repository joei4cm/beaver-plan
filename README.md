# Beaver Plan / 海狸旅行

Map-first travel OS — plan on a beautiful map, walk real routes, journal on the road, share, translate, collaborate.

**Brand:** Beaver Plan / 海狸旅行  
**Repo:** https://github.com/joei4cm/beaver-plan  
**Slice:** Post-MVP — Neon/Postgres + R2 media (S3-compatible API)

Product plan (Agent Store / humans):  
`docs/beaverplan-product-plan.md` in the BeaverPlan Cursor Project Agent Store.

---

## Monorepo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js — landing, planner, journal, share, collab, **live translate companion** |
| `apps/mobile` | Expo — itinerary + journal + share + invite + **conversation / camera translate** |
| `apps/api` | Hono on Cloudflare Workers — trips, maps, journal, media, share, membership, **translation BFF** |
| `packages/core` | Domain + MapEngine + journal/share/collab + **Translation ports** |
| `packages/ui-tokens` | Design tokens |
| `packages/i18n` | zh-CN + en |

**Out of scope here:** Baidu maps, CRDT / presence avatars, offline ASR packs.

---

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 10.x (`corepack enable` recommended)
- For API deploy: Cloudflare account + Wrangler
- Optional: Clerk, Google / Amap, OpenAI / Deepgram keys
- **Required for trip APIs:** a Neon (or any Postgres) `DATABASE_URL`
- **Required for journal/share media:** Cloudflare R2 S3 API credentials (`S3_*` or `R2_*`)

---

## Setup

```bash
git clone https://github.com/joei4cm/beaver-plan.git
cd beaver-plan
pnpm install
cp .env.example apps/web/.env.local
cp .env.example apps/api/.dev.vars
# Optional mobile:
# EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787
```

### Neon / Postgres (required for trips)

Trip, day, stop, leg, journal, share-artifact, membership, and invite data live in **Neon Postgres** via **Drizzle** (`@neondatabase/serverless` HTTP driver — Cloudflare Workers compatible). There is **no silent in-memory fallback** for those tables: missing `DATABASE_URL` → HTTP **503** on `/v1/trips`, `/v1/invites`, `/v1/share` (maps / translation / health still respond). Journal **photo bytes** live in **R2 via the S3 API** (object keys stored in Neon); missing S3/R2 env → HTTP **503** on `/v1/media*`.

1. Create a free project at [console.neon.tech](https://console.neon.tech).
2. Copy the connection string (prefer the **pooled** / `-pooler` host for Workers).
3. Put it in `apps/api/.dev.vars` as `DATABASE_URL=…` (and `wrangler secret put DATABASE_URL` for deploy).
4. Apply schema + migrations:

```bash
pnpm --filter @beaver/api db:migrate
# or first-time push against an empty DB:
# pnpm --filter @beaver/api db:push
```

| Table | Purpose |
|-------|---------|
| `trips` | Trip headers + optimistic `version` |
| `days` | Itinerary days |
| `stops` | Places on a day (engine place ref columns) |
| `legs` | Routed walk/transit/drive segments |
| `journal_entries` | Trip journal notes + media URL list |
| `share_artifacts` | Generated share cards (SVG data URL for now) |
| `trip_members` | Collab roles (owner / editor / viewer) |
| `trip_invites` | Invite codes |

On first request with a working DB, the API idempotently seeds **`sample-kyoto`** (same demo shape as before). Existing demo flows (`/trips/sample-kyoto`, journal, share, invites) keep the same JSON shapes.

**Smoke after migrate:** `pnpm dev:api` → `GET /health` should show `database.configured: true` → `GET /v1/trips/sample-kyoto` returns days/stops/members → open web planner on sample trip.

### Media / R2 (S3-compatible API)

Journal photos and share SVG objects use **Cloudflare R2** through the **S3-compatible API** (`aws4fetch` on Workers — not a proprietary R2 binding). Neon stores **object keys** (`media/{id}`, `share/{id}.svg`); bytes never stay in Worker memory.

1. Create a bucket in [Cloudflare R2](https://dash.cloudflare.com/?to=/:account/r2).
2. Create an **R2 API token** with Object Read & Write ([docs](https://developers.cloudflare.com/r2/api/tokens/)).
3. Put credentials in `apps/api/.dev.vars` (and `wrangler secret put …` for deploy):

```bash
# Preferred S3_* names
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_BUCKET=beaver-plan-media
S3_REGION=auto
# Optional public / custom domain (skips signed GET):
# S3_PUBLIC_BASE_URL=https://media.example.com

# Equivalent R2_* aliases also work:
# R2_ACCOUNT_ID=…   # → builds the endpoint above
# R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_REGION
```

4. **CORS** (needed for browser signed PUT from the web app):

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

Without CORS, the web journal **falls back** to `POST /v1/media` (BFF PutObject) — still writes to R2. Mobile already uploads via that BFF path.

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/v1/media/presign` | Signed PUT URL + `key` to store in `journal.media` |
| `POST` | `/v1/media` | BFF upload (base64 or multipart) → S3 PutObject |
| `GET` | `/v1/media/:id` | 302 to signed GET (or public base URL) |
| `GET` | `/v1/media/:id?proxy=1` | Stream bytes through Worker |
| `GET` | `/v1/media/:id/signed` | JSON `{ key, downloadUrl }` |

`/health` → `media.configured: true` when S3/R2 env is set. Missing credentials → **503** with setup hints (no silent memory fallback).

**Demo steps:** set Neon + R2 env → `pnpm dev:api` + `pnpm dev:web` → open `/trips/sample-kyoto/journal` → photos load from R2 → upload a new photo → save entry → open Share studio and export PNG.

### Scripts

```bash
pnpm typecheck          # all packages
pnpm --filter @beaver/api db:migrate   # apply Drizzle migrations to Neon
pnpm --filter @beaver/api db:generate  # after schema edits
pnpm dev:api            # http://127.0.0.1:8787
pnpm dev:web            # http://localhost:3000
pnpm dev:mobile         # Expo Metro
pnpm build
```

---

## Live translation — LLM / ASR / TTS (Slice E)

Secrets stay **server-side** (`apps/api/.dev.vars` / `wrangler secret put`). Clients never embed provider keys. **Do not commit real secrets.**

### Demo without keys (recommended first)

1. Leave `OPENAI_API_KEY` / `DEEPGRAM_API_KEY` empty.
2. `pnpm dev:api` + `pnpm dev:web`
3. Open **http://localhost:3000/translate**
4. Click **下一句演示 / Next demo line**, or hold the mic (permission optional — falls back to scripted turns), or type a line.
5. Mobile: `pnpm dev:mobile` → **实时翻译** — conversation tab + camera OCR/caption with overlay subtitles.

`/health` and `GET /v1/translation/status` report `mode: "demo"` with provider ids `demo-asr` / `demo-llm` / `demo-tts` / `demo-vision`.

### Configure live providers

```bash
# apps/api/.dev.vars
FEATURE_TRANSLATION=true
OPENAI_API_KEY=sk-…                 # OpenAI-compatible
# OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_ASR_MODEL=whisper-1
OPENAI_TTS_MODEL=tts-1
OPENAI_TTS_VOICE=alloy

# Optional Deepgram ASR instead of Whisper
# DEEPGRAM_API_KEY=…
# ASR_PROVIDER=deepgram

# Pluggable selectors: auto | openai | deepgram | edge | demo
ASR_PROVIDER=auto
LLM_PROVIDER=auto
TTS_PROVIDER=auto                   # edge = device/browser SpeechSynthesis
```

| Provider slot | `auto` behavior | Explicit options |
|---------------|-----------------|------------------|
| **LLM** | OpenAI chat if key set, else demo | `openai`, `demo` |
| **ASR** | Deepgram if its key set, else OpenAI Whisper, else demo | `openai`, `deepgram`, `demo` |
| **TTS** | OpenAI speech if key set, else Edge/local speak | `openai`, `edge`, `demo` |
| **Vision** | OpenAI vision chat if key set, else demo OCR/caption | (follows LLM key) |

Restart `pnpm dev:api` after editing `.dev.vars`.

### Translation API

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/translation/status` | mode + provider ids + locales |
| `POST` | `/v1/translation/translate` | `{ text, sourceLocale, targetLocale }` |
| `POST` | `/v1/translation/asr` | `{ audioBase64, mimeType, locale? }` |
| `POST` | `/v1/translation/tts` | `{ text, locale }` → audio or `speakLocally` |
| `POST` | `/v1/translation/turn` | chunked live turn: audio and/or text → translate → TTS |
| `POST` | `/v1/translation/vision` | `{ imageBase64?, mode: "ocr"\|"caption", locales }` |

Pipeline (packages/core): **ASR → TranslationProvider → TTS**, with optional **camera OCR / scene caption**.

UX is chunked near-real-time (one utterance per `/turn`), not a perfect full-duplex stream — usable live assist for MVP.

---

## Auth — Clerk + WeChat

See Slice D notes: without Clerk keys, apps use demo identity headers (`X-Beaver-User-Id`). WeChat OAuth is configured in Clerk Dashboard (no fake AppID in this repo).

---

## Multiplayer trips

Roles owner / editor / viewer; version conflicts → 409. Demo invite flow still works on `/trips/sample-kyoto`.

---

## What works without keys vs with keys

| Capability | No keys | With OpenAI / Deepgram | With Clerk / maps |
|------------|---------|------------------------|-------------------|
| Scripted bilingual translate UI (web + mobile) | ✅ | — | — |
| Live ASR → LLM → TTS | demo | ✅ | — |
| Camera OCR / caption | demo overlays | ✅ vision | — |
| Kyoto planner / journal / share / collab | ✅ Neon `DATABASE_URL` + R2 `S3_*` for photos | — | ✅ when keyed |

---

## Maps keys (Google + Amap)

Secrets in **`apps/api/.dev.vars`**. Without them, Places + Directions use curated demo POIs.

---

## Cloudflare deploy notes

Hosting is **Cloudflare only** (Workers + R2; no VPS).

```bash
cd apps/api
pnpm exec wrangler secret put DATABASE_URL   # Neon connection string (required)
pnpm exec wrangler secret put S3_ACCESS_KEY_ID
pnpm exec wrangler secret put S3_SECRET_ACCESS_KEY
# also set vars/secrets: S3_ENDPOINT (or R2_ACCOUNT_ID), S3_BUCKET, S3_REGION=auto
pnpm exec wrangler secret put OPENAI_API_KEY
# optional: DEEPGRAM_API_KEY, CLERK_*, GOOGLE_MAPS_SERVER_KEY, AMAP_SERVER_KEY
pnpm --filter @beaver/api db:migrate        # against the same Neon DB
pnpm deploy
```

---

## i18n

- Default locale: **zh-CN**; full **en** in `packages/i18n`.
- Live translation source/target locales are independent of UI locale.
- Web: `bp_locale` cookie. Mobile shell: zh-CN for now.

---

## License / ownership

Private product for Beaver Plan. Not related to TapFeet IME — keep codebases separate.
