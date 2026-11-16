# Beaver Plan / 海狸旅行

Map-first travel OS — plan on a beautiful map, walk real routes, journal on the road, share, translate, collaborate.

**Brand:** Beaver Plan / 海狸旅行  
**Repo:** https://github.com/joei4cm/beaver-plan  
**Slice:** C — Trip journal + multi-template share images (on top of A foundation + B maps).

Product plan (Agent Store / humans):  
`docs/beaverplan-product-plan.md` in the BeaverPlan Cursor Project Agent Store.

---

## Monorepo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js — landing, trip planner, **journal**, **share studio** |
| `apps/mobile` | Expo — itinerary + **journal capture/view** + **share sheet** |
| `apps/api` | Hono on Cloudflare Workers — trips, maps BFF, **journal**, **media stub**, **share render** |
| `packages/core` | Domain + MapEngine + **journal helpers** + **share SVG templates** |
| `packages/ui-tokens` | Design tokens |
| `packages/i18n` | zh-CN + en |

**Out of scope here:** TapFeet IME, collab, live translation, Baidu, Clerk WeChat (later slices).

---

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 10.x (`corepack enable` recommended)
- For API deploy: Cloudflare account + Wrangler
- Optional: Google Maps Platform + 高德开放平台 keys (see Slice B section)

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

### Scripts

```bash
pnpm typecheck          # all packages
pnpm dev:api            # http://127.0.0.1:8787
pnpm dev:web            # http://localhost:3000
pnpm dev:mobile         # Expo Metro
pnpm build
```

---

## Demo Slice C locally (journal + share cards)

1. Start API + web:

```bash
pnpm dev:api
# other terminal
pnpm dev:web
```

2. Open the seeded Kyoto trip planner:  
   **http://localhost:3000/trips/sample-kyoto**

3. **Journal** — **http://localhost:3000/trips/sample-kyoto/journal**  
   - Day tabs with seeded short notes + placeholder photos  
   - Add a caption, upload local images (stored in API memory), save

4. **Share studio** — **http://localhost:3000/trips/sample-kyoto/share**  
   - Pick day + one of three templates (`magazine-reel` 9:16, `path-square` 1:1, `day-film` 9:16)  
   - Preview renders from trip/day + journal photos  
   - **Download PNG** (SVG → canvas) or **System share** when the browser supports it

5. Mobile (optional): `pnpm dev:mobile` → open sample trip → **记一笔** / **分享图**  
   - Library picker uploads via `/v1/media`  
   - Share sheet writes a temp SVG and opens `expo-sharing`

Templates live in `packages/core/src/share.ts` (code components, not a designer).

---

## Media / R2 (Slice C stubs)

Hosting stays **Cloudflare only**. Journal photos and share artifacts are **R2-ready** but currently use an **in-memory** store so local demo works without a bucket.

| Today (dev) | Production path |
|-------------|-----------------|
| `POST /v1/media` (JSON base64 or multipart) → `Map` in Worker memory | Uncomment `[[r2_buckets]]` `MEDIA` in `apps/api/wrangler.toml` |
| `GET /v1/media/:id` serves bytes | `MEDIA.put(key, bytes)` / public or signed URL |
| `POST /v1/media/presign` returns stub upload instructions | Return R2 signed PUT URL |
| Share `storageUrl` may be SVG data URL | Persist PNG/SVG object to R2, store public URL on `ShareArtifact` |

Env placeholders (see `.env.example`): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. Prefer the Wrangler R2 binding over S3-style keys when deploying.

**Note:** In-memory media resets when the Worker/dev process restarts. Seeded Kyoto demo photos are recreated on first request via `ensureSampleTrip()`.

---

## Journal & share API

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/trips/:id/journal` | Optional `?dayId=` / `?stopId=` |
| `POST` | `/v1/trips/:id/journal` | `{ dayId?, stopId?, body, media? }` |
| `PATCH/DELETE` | `/v1/trips/:id/journal/:entryId` | Update / remove |
| `POST` | `/v1/media` | Upload stub (memory) |
| `GET` | `/v1/media/:id` | Fetch bytes |
| `POST` | `/v1/media/presign` | Stub until R2 |
| `GET` | `/v1/share/templates` | Template metadata |
| `POST` | `/v1/trips/:id/share` | Render SVG from day + journal; optional persist |
| `GET` | `/v1/trips/:id/share` | Recent artifacts (metadata) |

---

## What works without keys vs with keys

| Capability | No map keys (demo) | With server keys |
|------------|--------------------|------------------|
| Trip planner UI, day tabs, stop order, map↔list highlight | ✅ curated Kyoto / CN POIs | ✅ same UI |
| Place search / reverse geocode | ✅ demo catalog match | ✅ Google Places (New) or Amap REST |
| Adjacent-stop directions + polyline | ✅ haversine demo path | ✅ Google Routes or Amap walk/transit/drive |
| Journal notes + multi-photo | ✅ in-memory media | ✅ same (R2 when bound) |
| Multi-template share SVG → PNG | ✅ three templates | ✅ same |
| Engine preference Auto / Google / Amap | ✅ | ✅ live vendor |
| Clerk auth | placeholder | still placeholder until Clerk keys |

**Demo mode** for maps is automatic when `GOOGLE_MAPS_SERVER_KEY` / `AMAP_SERVER_KEY` are missing. `/health` reports map secrets + media storage mode.

---

## Maps keys (Google + Amap)

Secrets belong in **`apps/api/.dev.vars`** locally and `wrangler secret put …` in production. Do not put server keys in `NEXT_PUBLIC_*`.

### Google

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Places API (New)** and **Routes API**.
3. Create an API key; restrict by IP / Workers if possible.
4. Set `GOOGLE_MAPS_SERVER_KEY=…` in `.dev.vars`.
5. Optional: `NEXT_PUBLIC_GOOGLE_MAPS_JS_KEY` for a future browser Maps JS overlay (HTTP referrer restricted). The planner renders an engine-agnostic SVG stage and does not require the JS key.

### Amap (高德)

1. Register at [高德开放平台](https://console.amap.com/).
2. Create a **Web服务** key for the BFF (`AMAP_SERVER_KEY`).
3. Optional JS / mobile keys: `NEXT_PUBLIC_AMAP_JS_KEY`, `EXPO_PUBLIC_AMAP_KEY` (console-restricted).
4. With `MAP_AUTO_AMAP_CN=true` (default), preference `auto` resolves to Amap when the request looks like mainland China (`CF-IPCountry=CN`, or zh-CN / Asia/Shanghai heuristics). Manual Google / Amap override always wins.

### Product defaults

| Variable | Default | Meaning |
|----------|---------|---------|
| `DEFAULT_MAP_ENGINE` | `google` | Used when preference is unset / `auto` base |
| `MAP_AUTO_AMAP_CN` | `true` | Auto-switch to Amap for mainland CN |

---

## BFF map routes

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/maps/engine` | Resolve preference → engine + demo/live |
| `GET` | `/v1/places/search?q=` | Places proxy |
| `GET` | `/v1/places/:id` | Place details |
| `GET` | `/v1/geocode/reverse?lat=&lng=` | Reverse geocode |
| `POST` | `/v1/directions` | `{ origin, destination, mode }` |
| `POST` | `/v1/trips/:id/route-day` | Route all adjacent stops for a day |
| `POST/PATCH/DELETE` | `/v1/trips/:id/stops…` | In-memory stops for planner demo |

---

## Environment variables

See **[`.env.example`](./.env.example)** for the full template.

---

## Cloudflare deploy notes

Hosting is **Cloudflare only** (Workers + R2; no VPS).

```bash
cd apps/api
pnpm exec wrangler secret put GOOGLE_MAPS_SERVER_KEY
pnpm exec wrangler secret put AMAP_SERVER_KEY
# optional: CLERK_SECRET_KEY, DATABASE_URL, …
# Create R2 bucket beaver-plan-media, uncomment [[r2_buckets]] in wrangler.toml
pnpm deploy
```

---

## i18n

- Default locale: **zh-CN**; full **en** in `packages/i18n`.
- Web: `bp_locale` cookie.
- Mobile shell: zh-CN for now.

---

## Auth (Clerk)

Env placeholders only. Sign-in control remains non-functional until keys exist.

---

## License / ownership

Private product for Beaver Plan. Not related to TapFeet IME — keep codebases separate.
