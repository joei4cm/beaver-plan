# Beaver Plan / 海狸旅行

Map-first travel OS — plan on a beautiful map, walk real routes, journal on the road, share, translate, collaborate.

**Brand:** Beaver Plan / 海狸旅行  
**Repo:** https://github.com/joei4cm/beaver-plan  
**Slice:** D — Multiplayer trips + Clerk auth (+ WeChat OAuth scaffolding)

Product plan (Agent Store / humans):  
`docs/beaverplan-product-plan.md` in the BeaverPlan Cursor Project Agent Store.

---

## Monorepo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js — landing, planner, journal, share, **invite / members**, Clerk |
| `apps/mobile` | Expo — itinerary + journal + share + **invite accept** (+ Clerk when keyed) |
| `apps/api` | Hono on Cloudflare Workers — trips, maps, journal, media, share, **membership** |
| `packages/core` | Domain + MapEngine + journal/share + **collab helpers** |
| `packages/ui-tokens` | Design tokens |
| `packages/i18n` | zh-CN + en |

**Out of scope here:** live translation (Slice E), Baidu maps, CRDT / presence avatars.

---

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 10.x (`corepack enable` recommended)
- For API deploy: Cloudflare account + Wrangler
- Optional: Clerk app keys; Google / Amap server keys

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

## Auth — Clerk + WeChat (how to enable)

Secrets stay **server-side** (`CLERK_SECRET_KEY` in `apps/api/.dev.vars` / Wrangler). Clients only get publishable keys. **Do not commit real secrets.**

### 1. Create a Clerk application

1. Open [Clerk Dashboard](https://dashboard.clerk.com) → create an application.
2. Enable Email (and optionally Apple / Google) under **User & Authentication**.
3. Copy:
   - Publishable key → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (web) and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (mobile)
   - Secret key → `CLERK_SECRET_KEY` (API / Workers only)
4. Optional but recommended for Workers JWT verify:
   - `CLERK_PUBLISHABLE_KEY` (same as publishable) **or**
   - `CLERK_JWT_ISSUER=https://<your-frontend-api>` (from Clerk → API keys / Frontend API)

### 2. Wire local env

```bash
# apps/web/.env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
NEXT_PUBLIC_CLERK_WECHAT_ENABLED=false

# apps/api/.dev.vars
CLERK_SECRET_KEY=sk_test_…
CLERK_PUBLISHABLE_KEY=pk_test_…   # or CLERK_JWT_ISSUER=…
PUBLIC_WEB_ORIGIN=http://localhost:3000
```

Restart `pnpm dev:web` and `pnpm dev:api`. Sign-in UI appears at `/sign-in`. Trip **mutations** then require `Authorization: Bearer <Clerk session JWT>`.

### 3. WeChat login path (Clerk social connection)

WeChat credentials live in **Clerk + WeChat Open Platform**, not in this repo.

1. Clerk Dashboard → **User & Authentication → Social connections → WeChat**.
2. Create / use a [WeChat Open Platform](https://open.weixin.qq.com/) mobile/web application; paste AppID / AppSecret into Clerk (Clerk stores them).
3. Copy the **redirect / callback URL** Clerk shows into the WeChat open platform authorized callbacks.
4. In Beaver Plan env, surface the UI entry:

```bash
NEXT_PUBLIC_CLERK_WECHAT_ENABLED=true
EXPO_PUBLIC_CLERK_WECHAT_ENABLED=true
CLERK_WECHAT_ENABLED=true
```

5. Users pick WeChat in the Clerk sign-in panel (`/sign-in`). No placeholder AppID/secret is invented in code.

If WeChat review or Clerk connector access is pending, leave the flags `false` — Email / Apple / Google still work once Clerk keys are set.

### 4. Mobile (Expo)

When `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is a real `pk_…` key, `apps/mobile` wraps `ClerkProvider` + secure token cache. Without it, mobile uses the same demo identity headers as web.

---

## Multiplayer trips (Slice D)

Roles: **owner** / **editor** / **viewer**.

| Action | owner | editor | viewer |
|--------|-------|--------|--------|
| View trip / members | ✅ | ✅ | ✅ |
| Edit stops / journal / routes | ✅ | ✅ | ❌ |
| Create invite link/code | ✅ | ✅ | ❌ |
| Change roles / remove members / delete trip | ✅ | ❌ | ❌ |

Conflict strategy: clients send `expectedVersion` on mutations. Mismatch → **409** `version_conflict` with `serverVersion` (refresh + retry). No CRDT.

### Demo without Clerk keys

1. `pnpm dev:api` + `pnpm dev:web`
2. Open **http://localhost:3000/trips/sample-kyoto** — members bar shows seeded owner + companion.
3. Click **邀请同行 / Invite** → copy link or `BP-……` code.
4. Open the invite URL (or `/invite/<code>`). Accept joins as the demo identity (`X-Beaver-User-Id`, default `demo-user`).
5. To simulate another person locally, set a different demo id in the browser console before accept is not required for the owner path — mint an invite, then call the API:

```bash
curl -s -X POST http://127.0.0.1:8787/v1/invites/BP-XXXXXX/accept \
  -H 'content-type: application/json' \
  -H 'x-beaver-user-id: friend-1' \
  -H 'x-beaver-display-name: Friend' \
  -d '{}'
```

### Membership API

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/trips/:id/members` | List + `yourRole` |
| `POST` | `/v1/trips/:id/invites` | `{ role?: "editor"\|"viewer" }` → code + URL |
| `GET` | `/v1/trips/:id/invites` | Active invites (editor+) |
| `POST` | `/v1/trips/:id/invites/:code/revoke` | Owner |
| `PATCH/DELETE` | `/v1/trips/:id/members/:userId` | Owner role changes / remove |
| `GET` | `/v1/invites/:code` | Public preview |
| `POST` | `/v1/invites/:code/accept` | Auth required → join |

Trip content mutations (`POST/PATCH/DELETE` stops, trip patch, journal writes, …) require auth and **editor+**. Pass optional `expectedVersion`.

---

## What works without keys vs with keys

| Capability | No Clerk / map keys | With Clerk keys | With map keys |
|------------|---------------------|-----------------|---------------|
| Kyoto sample planner, journal, share | ✅ | ✅ (sign-in for mutations) | ✅ |
| Members bar + invite link/code | ✅ demo identity | ✅ Clerk user id | — |
| Accept invite / roles | ✅ `X-Beaver-User-Id` | ✅ Bearer JWT | — |
| Sign-in UI + WeChat entry flag | scaffolding / demo panel | ✅ real Clerk (+ WeChat if enabled) | — |
| Protected trip mutations | demo headers | JWT + membership | — |
| Places / directions | demo catalog | — | Google / Amap live |

`/health` reports `auth.mode` (`demo` \| `clerk`), `auth.wechatUi`, and map secret presence.

---

## Demo Slice C locally (journal + share)

Still available on the sample trip:

- Journal — http://localhost:3000/trips/sample-kyoto/journal  
- Share studio — http://localhost:3000/trips/sample-kyoto/share  

See earlier slices for media/R2 stubs and map key setup.

---

## Maps keys (Google + Amap)

Secrets belong in **`apps/api/.dev.vars`** locally and `wrangler secret put …` in production. Do not put server keys in `NEXT_PUBLIC_*`.

| Variable | Default | Meaning |
|----------|---------|---------|
| `DEFAULT_MAP_ENGINE` | `google` | Used when preference is unset / `auto` base |
| `MAP_AUTO_AMAP_CN` | `true` | Auto-switch to Amap for mainland CN |

---

## Cloudflare deploy notes

Hosting is **Cloudflare only** (Workers + R2; no VPS).

```bash
cd apps/api
pnpm exec wrangler secret put CLERK_SECRET_KEY
pnpm exec wrangler secret put CLERK_PUBLISHABLE_KEY
pnpm exec wrangler secret put GOOGLE_MAPS_SERVER_KEY
pnpm exec wrangler secret put AMAP_SERVER_KEY
# optional: DATABASE_URL, …
pnpm deploy
```

---

## i18n

- Default locale: **zh-CN**; full **en** in `packages/i18n`.
- Web: `bp_locale` cookie.
- Mobile shell: zh-CN for now.

---

## License / ownership

Private product for Beaver Plan. Not related to TapFeet IME — keep codebases separate.
