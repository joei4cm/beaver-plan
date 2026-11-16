# Beaver Plan / 海狸旅行

Map-first travel OS — plan on a beautiful map, walk real routes, journal on the road, share, translate, collaborate.

**Brand:** Beaver Plan / 海狸旅行  
**Repo:** https://github.com/joei4cm/beaver-plan  
**Slice:** B — Maps / itinerary foundation (Google + Amap ports, planner UI, BFF proxy).

Product plan (Agent Store / humans):  
`docs/beaverplan-product-plan.md` in the BeaverPlan Cursor Project Agent Store.

---

## Monorepo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js — landing, trip list, **map trip planner** |
| `apps/mobile` | Expo — splash + **itinerary viewer** for sample trip |
| `apps/api` | Hono on Cloudflare Workers — trips + **Places / Directions BFF** |
| `packages/core` | Domain + MapEngine / RoutingEngine (Google, Amap, demo) |
| `packages/ui-tokens` | Design tokens |
| `packages/i18n` | zh-CN + en |

**Out of scope here:** TapFeet IME, journal/share, collab, live translation (later slices).

---

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 10.x (`corepack enable` recommended)
- For API deploy: Cloudflare account + Wrangler
- Optional: Google Maps Platform + 高德开放平台 keys (see below)

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
pnpm dev:web            # http://localhost:3000  → /trips/sample-kyoto
pnpm dev:mobile         # Expo Metro → sample itinerary viewer
pnpm build
```

Open **http://localhost:3000/trips/sample-kyoto** with the API running for the full planner demo.

---

## What works without keys vs with keys

| Capability | No map keys (demo) | With server keys |
|------------|--------------------|------------------|
| Trip planner UI, day tabs, stop order, map↔list highlight | ✅ curated Kyoto / CN POIs | ✅ same UI |
| Place search / reverse geocode | ✅ demo catalog match | ✅ Google Places (New) or Amap REST |
| Adjacent-stop directions + polyline | ✅ haversine demo path | ✅ Google Routes or Amap walk/transit/drive |
| Engine preference Auto / Google / Amap | ✅ preference stored; Auto uses region hint | ✅ live vendor for resolved engine |
| Mainland auto → Amap | ✅ region from CF country / zh-CN / timezone | ✅ same + live Amap when `AMAP_SERVER_KEY` set |
| Clerk auth | placeholder | still placeholder until Clerk keys |

**Demo mode** is automatic when `GOOGLE_MAPS_SERVER_KEY` / `AMAP_SERVER_KEY` are missing. `/health` reports which map secrets are present.

---

## Maps keys (Google + Amap)

Secrets belong in **`apps/api/.dev.vars`** locally and `wrangler secret put …` in production. Do not put server keys in `NEXT_PUBLIC_*`.

### Google

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Places API (New)** and **Routes API**.
3. Create an API key; restrict by IP / Workers if possible.
4. Set `GOOGLE_MAPS_SERVER_KEY=…` in `.dev.vars`.
5. Optional: `NEXT_PUBLIC_GOOGLE_MAPS_JS_KEY` for a future browser Maps JS overlay (HTTP referrer restricted). The Slice B planner renders an engine-agnostic SVG stage and does not require the JS key.

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
