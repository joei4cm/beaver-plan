# Beaver Plan / 海狸旅行

Map-first travel OS — plan on a beautiful map, walk real routes, journal on the road, share, translate, collaborate.

**Brand:** Beaver Plan / 海狸旅行  
**Repo:** https://github.com/joei4cm/beaver-plan  
**Slice:** Phase 3 — deep offline + translation enhancements on main; OTA booking deep links + demo search stub; Neon + R2; live keys checklist in [`docs/keys-integration.md`](docs/keys-integration.md)

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
| `packages/offline` | Deep offline trip cache + journal-first sync queue (IndexedDB / AsyncStorage adapters in apps) |
| `packages/ui-tokens` | Design tokens |
| `packages/i18n` | zh-CN + en |

**Out of scope here:** CRDT / presence avatars, offline ASR packs, full Baidu/Google offline map tile SDKs, OTA payment capture / full inventory sync.

---

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 10.x (`corepack enable` recommended)
- For API deploy: Cloudflare account + Wrangler
- Optional: Clerk, Google / Amap / Baidu, OpenAI / Deepgram keys
- **Required for trip APIs:** a Neon (or any Postgres) `DATABASE_URL`
- **Required for journal/share media:** Cloudflare R2 S3 API credentials (`S3_*` or `R2_*`)

---

## Setup

```bash
git clone https://github.com/joei4cm/beaver-plan.git
cd beaver-plan
pnpm install
cp .env.example apps/web/.env.local
cp apps/api/.dev.vars.example apps/api/.dev.vars
# Optional mobile:
# EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787
```

**Turn on real services:** follow [`docs/keys-integration.md`](docs/keys-integration.md) (Clerk / WeChat, Google+Amap, Neon, R2 CORS, OpenAI/Deepgram, smoke matrix).

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
| `trip_comments` | Trip / stop comments (+ `@` display-name mentions) |
| `trip_activity_events` | Append-only collab activity timeline |

On first request with a working DB, the API idempotently seeds **`sample-kyoto`** (same demo shape as before). Existing demo flows (`/trips/sample-kyoto`, journal, share, invites) keep the same JSON shapes. Empty sample legs are soft-upgraded to **multi-step Kyoto transit** (清水寺→祗园 bus; 伏见→岚山 JR transfer) so the planner shows transfer steps without map keys.

**Smoke after migrate:** `pnpm dev:api` → `GET /health` should show `database.configured: true` → `GET /v1/trips/sample-kyoto` returns days/stops/members/legs → open web planner on `/trips/sample-kyoto` → Day 1 / Day 2 show walk→line→transfer step lists and mode-styled polylines.

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

`/health` → `media.configured: true` when S3/R2 env is set. Missing credentials → **503** with setup hints (no silent memory fallback). Optional `SMOKE_TOKEN` enables `GET /v1/ops/smoke` (real Neon + R2 connectivity; 404 when unset).

**Demo steps:** set Neon + R2 env → `pnpm dev:api` + `pnpm dev:web` → open `/trips/sample-kyoto/journal` → photos load from R2 → upload a new photo → save entry → open Share studio and export PNG.

**Operator smoke:** `pnpm smoke:neon-r2` (dry-run, no credentials) → `API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:neon-r2` after migrate. Details: [`docs/deploy-cloudflare.md`](docs/deploy-cloudflare.md).

### Scripts

```bash
pnpm typecheck          # all packages
pnpm --filter @beaver/api db:migrate   # apply Drizzle migrations to Neon
pnpm --filter @beaver/api db:generate  # after schema edits
pnpm smoke:neon-r2      # Neon+R2 checklist; dry-run without API_BASE_URL
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
| `GET` | `/v1/translation/status` | mode + provider ids + locales + streaming/offline flags |
| `GET` | `/v1/translation/locales` | all locales + `primaryLocales` (zh-CN, en, ja, ko, fr, es, de) |
| `GET` | `/v1/translation/streaming` | Deepgram live WS + OpenAI Realtime settings (no secrets) |
| `GET` | `/v1/translation/phrasebook` | cached travel phrases for a language pair |
| `POST` | `/v1/translation/offline-assist` | phrasebook stub translate / queue hint |
| `POST` | `/v1/translation/partial` | interim / timeslice ASR for optimistic UI |
| `POST` | `/v1/translation/translate` | `{ text, sourceLocale, targetLocale }` |
| `POST` | `/v1/translation/asr` | `{ audioBase64, mimeType, locale? }` |
| `POST` | `/v1/translation/tts` | `{ text, locale }` → audio or `speakLocally` |
| `POST` | `/v1/translation/turn` | finalize turn: audio and/or text → translate → TTS |
| `POST` | `/v1/translation/vision` | `{ imageBase64?, mode: "ocr"\|"caption", locales }` |

Pipeline (packages/core): **ASR → TranslationProvider → TTS**, with optional **camera OCR / scene caption**.

### Lower-latency path (Phase 3)

- **Default:** chunked MediaRecorder timeslices (~900 ms) + `POST /v1/translation/partial`, then finalize on `/turn`. Web also uses browser `SpeechRecognition` interim results when available.
- **Deepgram streaming:** `GET /v1/translation/streaming` returns `wss://api.deepgram.com/v1/listen` query (`interim_results=true`, `endpointing=300`). Connect with `Authorization: Token <DEEPGRAM_API_KEY>`.
- **OpenAI Realtime:** same endpoint documents `wss://api.openai.com/v1/realtime` + model hint. Mint an ephemeral client secret from the BFF before connecting; Whisper remains the batch finalizer.
- Not full-duplex by default — optimistic partials + utterance finalize is the practical live assist.

### Semi-offline assist

- Cached **travel phrasebook** (greetings / directions / food / shopping / emergency / lodging) for primary locales — works with no keys and on airplane mode.
- Clients queue free-form phrases locally when offline or when live translate fails; flush with `/turn` when back online.
- Not full on-device ASR packs (Expo / browser interim only where cheap).

---

## Auth — Clerk + WeChat

Without Clerk keys, apps use demo identity headers (`X-Beaver-User-Id`). WeChat OAuth is configured in Clerk Dashboard (no fake AppID in this repo). Step-by-step: [`docs/keys-integration.md`](docs/keys-integration.md#1-clerk-web--expo--wechat).

---

## Multiplayer trips

Roles owner / editor / viewer; version conflicts → 409. Demo invite flow still works on `/trips/sample-kyoto`.

### Comments + activity timeline

Phase 2 step 5 — trip (and optional stop) comments with simple `@DisplayName` mentions, plus an append-only activity rail. Viewers can read; only editor+ can post. No websockets — poll/refresh is enough.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/trips/:id/comments` | Membership (sample-kyoto open). Optional `?stopId=` |
| `POST` | `/v1/trips/:id/comments` | Auth + **edit**. Body `{ body, stopId? }`. Parses `@` mentions against member display names |
| `GET` | `/v1/trips/:id/activity` | Newest first. Optional `?limit=` (default 40) |

Activity hooks: invite created, member joined, stop added, comment posted, day-fill applied. `sample-kyoto` seeds a short thread + timeline when empty.

**Web demo (after Neon migrate):** set `DATABASE_URL` in `apps/api/.dev.vars`, then:

```bash
pnpm --filter @beaver/api db:migrate
pnpm typecheck
pnpm --filter @beaver/core test                 # mention + role unit smoke (no DB)
pnpm --filter @beaver/api smoke:collab-schema   # migration/schema smoke (no DB)
pnpm dev
```

Open **http://localhost:3000/trips/sample-kyoto** → **评论与动态** panel (companions bar above). Switch Comments / Activity; type `@` to mention; viewers see a read-only note.

---

## Trip duplicate + city playbooks (城市玩法)

Phase 2 step 1 — clone a trip or materialize a read-only city skeleton into a new owned trip (Neon).

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/v1/trips/:id/duplicate` | Auth required. Body `{ copyJournal?: boolean, title?: string }`. Default copies days + stops (no photos/legs); optional journal **text only**. New id/version; sole member = you as owner. |
| `GET` | `/v1/templates` | Code-seeded catalog (Kyoto 3-day, Shanghai weekend, Hangzhou lake). No DB required. |
| `POST` | `/v1/templates/:id/create` | Auth required. Body `{ title?, startDate? }`. Creates days/stops from the template. |

**Web demo:** `/trips` → **城市玩法** “用此玩法”, or **复制行程** (optional “同时复制日记文字”); trip planner header also has **复制**.

---

## LLM auto day-fill (智能填天)

Phase 2 step 4 — propose day → stop assignments from **interests** + **max walk minutes/day**. Secrets stay on the BFF (`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `LLM_PROVIDER`); the web UI never sees keys.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/day-fill/status` | `mode` + provider id (`demo-day-fill` / `openai-day-fill`) |
| `POST` | `/v1/trips/:id/day-fill/propose` | Auth + edit. Body `{ interests, maxWalkMinutesPerDay, dayCount?, locale? }` → **draft** proposal (not persisted yet) |
| `POST` | `/v1/trips/:id/day-fill/apply` | Auth + edit. Body `{ proposal, expectedVersion? }` → replace days/stops; clears legs |

### Demo without `OPENAI_API_KEY`

1. Leave `OPENAI_API_KEY` empty (`LLM_PROVIDER=auto` or `demo`).
2. Open **http://localhost:3000/trips/sample-kyoto** (or an empty trip).
3. Expand **智能填天** → pick interest chips + walk budget → **生成草稿** → preview → **应用到行程**.
4. Scripted Kyoto / destination catalog fill; `/health` shows `dayFill.mode: "demo"`.

### With OpenAI-compatible key

Same UI. Set `OPENAI_API_KEY` (+ optional `OPENAI_BASE_URL`, `OPENAI_CHAT_MODEL`) in `apps/api/.dev.vars`, restart API. Propose uses chat completions JSON; apply still requires user confirm. `LLM_PROVIDER=demo` forces scripted fill even with a key.

---

## What works without keys vs with keys

| Capability | No keys | With OpenAI / Deepgram | With Clerk / maps |
|------------|---------|------------------------|-------------------|
| Scripted bilingual translate UI (web + mobile) | ✅ | — | — |
| Live ASR → LLM → TTS | demo | ✅ | — |
| Multi-locale pairs (ja/ko/fr/es/de) + phrasebook offline | ✅ | — | — |
| Chunked partial ASR / streaming provider docs | ✅ | optional Realtime WS | — |
| Camera OCR / caption | demo overlays | ✅ vision | — |
| Smart day-fill (智能填天) | scripted demo | ✅ LLM propose | — |
| Kyoto planner / journal / share / collab | ✅ Neon `DATABASE_URL` + R2 `S3_*` for photos | — | ✅ when keyed |

Full enablement checklist + smoke matrix: [`docs/keys-integration.md`](docs/keys-integration.md).

---

## Maps keys (Google + Amap + Baidu)

Secrets in **`apps/api/.dev.vars`**. Without them, Places + Directions use curated demo POIs with **rich multi-step transit** (line names, agencies, per-step polylines). With live keys, Google / Amap / Baidu Directions still normalize into the same `transitSteps` shape. Default preference is **`auto`** (`DEFAULT_MAP_ENGINE=auto`) so mainland CN resolves to Amap when `MAP_AUTO_AMAP_CN=true`. **Baidu is manual only** (`preference=baidu` / trip setting) — never selected by auto. Verify with `GET /v1/maps/engine?preference=auto&timezone=Asia/Shanghai` and `…?preference=baidu`. Planner map UI is an SVG stage for all engines (no vendor JS tiles yet); Baidu live coords are BD-09.

---

## Cloudflare deploy

Hosting is **Cloudflare only** (Workers + R2 + Pages; no VPS). Full guide: [`docs/deploy-cloudflare.md`](docs/deploy-cloudflare.md).

```bash
# Bundle check (no Cloudflare account required)
pnpm --filter @beaver/api deploy:dry

# After wrangler login + secrets (per env: preview | production):
pnpm --filter @beaver/api db:migrate
pnpm --filter @beaver/api deploy:preview      # beaver-plan-api-preview
pnpm --filter @beaver/api deploy:production  # beaver-plan-api

# Secrets example (names only — values via interactive prompt / CI):
cd apps/api
pnpm exec wrangler secret put DATABASE_URL --env production
pnpm exec wrangler secret put S3_ACCESS_KEY_ID --env production
pnpm exec wrangler secret put S3_SECRET_ACCESS_KEY --env production
# also: S3_ENDPOINT|R2_ACCOUNT_ID, S3_BUCKET, S3_REGION=auto
# optional: OPENAI_API_KEY, CLERK_*, GOOGLE_MAPS_SERVER_KEY, AMAP_SERVER_KEY, BAIDU_MAP_SERVER_KEY, …
pnpm exec wrangler secret list --env production
```

`GET /health` reports `deploy.env` + configured flags (booleans) — never secret values. Web: Cloudflare Pages via OpenNext (docs in the deploy guide); local `pnpm dev:web` against a deployed Worker is fine until Pages is wired.

---

## Deep offline (Phase 3 — first cut)

Practical offline for **on-the-road journal**, not a full offline maps vendor pack.

| Piece | Behavior |
|-------|----------|
| **Pin trip for offline** | Web planner/journal + mobile trip detail. Caches trip / days / stops / journal text + last-known stop pins & route polylines into **IndexedDB** (web) or **AsyncStorage** (Expo). |
| **Journal-first sync** | When offline (or network fails), note + photo mutations enqueue locally; optimistic entries show in the journal. On reconnect, queue flushes FIFO (upload pending photos → create/delete journal). |
| **Conflicts** | Trip `expectedVersion` when present; on `409 version_conflict`, refresh version and retry, then omit version → **last-write-wins**. No CRDT. |
| **Map stub** | Cached stop coordinates + last polylines only. **Not** Baidu/Google/Amap offline tile SDKs. |

**Limits (honest):** no full offline map tiles; media bytes for queued photos live in the device KV until flush (keep picks small); unpin deletes the local cache (pending queue for that trip stays until flushed or cleared by sync).

**Airplane-mode demo**

1. Online: open `/trips/sample-kyoto` (or mobile trip) → **Pin for offline** → confirm status shows pinned.
2. Open Journal, optionally add a note while online once so cache has journal shape.
3. DevTools → Network → Offline (or OS airplane mode).
4. Reload journal / trip — pinned cache still shows days/stops/notes; MiniMap still draws cached pins/polylines.
5. Add a journal note (+ optional photo). UI shows “saved offline” / queued.
6. Go back online → queue flushes automatically (or tap **Sync now**). Refresh journal — server entries match; local `local-*` ids replaced.

Shared logic: `packages/offline` (`OfflineTripStore`, `flushOfflineQueue`). Adapters: `apps/web/src/lib/offline/*`, `apps/mobile/src/offline/*`.

---

## OTA / bookings (Phase 3 — first cut)

Practical deep links — **not** a marketplace or payment flow.

| Piece | Behavior |
|-------|----------|
| **Stop `bookingLinks`** | Hotel / flight / ticket URL + optional provider label. Edit in web planner **预订** panel; chips on stop list; mobile opens externally via `Linking`. |
| **Search stub** | `POST /v1/booking/search` `{ city, checkIn?, checkOut?, kind? }` → demo hotel/activity suggestions (no keys). |
| **Pluggable env** | `OTA_PROVIDER`, `AMADEUS_API_KEY` / `AMADEUS_API_SECRET`, `BOOKING_AFFILIATE_ID` — document + mode `configured` when set; still mock catalog until a live adapter. See [`docs/keys-integration.md`](docs/keys-integration.md). |
| **Neon** | Migration `0002_stop_booking_links` adds `stops.booking_links` jsonb. |

**Out of scope:** payment capture, inventory sync, full OTA checkout.

---

## i18n

- Default locale: **zh-CN**; full **en** in `packages/i18n`.
- Live translation source/target locales are independent of UI locale.
- Web: `bp_locale` cookie. Mobile shell: zh-CN for now.

---

## License / ownership

Private product for Beaver Plan. Not related to TapFeet IME — keep codebases separate.
