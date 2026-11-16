# Beaver Plan / 海狸旅行

Map-first travel OS — plan on a beautiful map, walk real routes, journal on the road, share, translate, collaborate.

**Brand:** Beaver Plan / 海狸旅行  
**Repo:** https://github.com/joei4cm/beaver-plan  
**Slice:** A — Foundation only (scaffold, stubs, i18n skeleton). Not full product.

Product plan (Agent Store / humans):  
`docs/beaverplan-product-plan.md` in the BeaverPlan Cursor Project Agent Store  
(path on agent machines: `/cursor/stores/<project-store>/docs/beaverplan-product-plan.md`).

---

## Monorepo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js App Router + Tailwind — landing + trip list shell |
| `apps/mobile` | Expo + Expo Router — splash / home shell |
| `apps/api` | Hono on Cloudflare Workers — health + trip stubs |
| `packages/core` | Domain types + MapEngine / Routing / Collab / Translation ports (stubs) |
| `packages/ui-tokens` | Design tokens (CSS vars + TS constants) |
| `packages/i18n` | zh-CN + en message tables |

**Out of scope for this repo / Slice A:** TapFeet IME, full maps, live translation, real Clerk session wiring.

---

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 10.x (`corepack enable` recommended)
- For API deploy: Cloudflare account + [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- For auth later: [Clerk](https://clerk.com) application (Email / Apple / Google first; WeChat in MVP)

---

## Setup

```bash
git clone https://github.com/joei4cm/beaver-plan.git
cd beaver-plan
pnpm install
cp .env.example apps/web/.env.local   # fill Clerk / API URL when ready
cp .env.example apps/api/.dev.vars    # Workers local secrets (optional for health)
```

### Scripts

```bash
pnpm typecheck          # all packages
pnpm dev:web            # http://localhost:3000
pnpm dev:api            # http://127.0.0.1:8787  → GET /health
pnpm dev:mobile         # Expo Metro
pnpm build              # web (+ api placeholder); mobile via Expo EAS later
```

---

## Environment variables

See **[`.env.example`](./.env.example)** for the full template. Highlights:

| Variable | Where | Notes |
|----------|--------|--------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | web | Public Clerk key — no fake secrets in git |
| `CLERK_SECRET_KEY` | api / web server | `wrangler secret put CLERK_SECRET_KEY` |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | mobile | When Clerk Expo is wired |
| `NEXT_PUBLIC_API_BASE_URL` | web | Default `http://127.0.0.1:8787` |
| `DATABASE_URL` | api | Neon/Postgres — later Slice A PR |
| `R2_*` / R2 binding | api | Diary + share image objects |
| `GOOGLE_MAPS_*` / `AMAP_*` | api + clients | Slice B |
| `OPENAI_API_KEY` / TTS/ASR | api | Slice E |
| `DEFAULT_MAP_ENGINE` / `MAP_AUTO_AMAP_CN` | api | Product defaults |

Clerk keys are **not** committed. Sign-in UI on web is a labeled placeholder until keys exist.

---

## Cloudflare deploy notes

Hosting is **Cloudflare only** (Workers + R2; no VPS).

1. **API (Workers)**  
   ```bash
   cd apps/api
   pnpm exec wrangler login
   pnpm exec wrangler secret put CLERK_SECRET_KEY
   # optional: DATABASE_URL, GOOGLE_MAPS_SERVER_KEY, …
   pnpm deploy
   ```
   Config: `apps/api/wrangler.toml` (`name = beaver-plan-api`).  
   Uncomment `[[r2_buckets]]` when the `beaver-plan-media` bucket exists.

2. **R2**  
   Create bucket `beaver-plan-media` in the dashboard. Prefer a Workers R2 binding over long-lived access keys when possible. Use for journal originals and share-image outputs (Slice C).

3. **Web**  
   Deploy Next.js to Cloudflare Workers/Pages via OpenNext or your preferred CF Next adapter when ready. Local Slice A uses `next dev` / `next build` on Node.

4. **Secrets**  
   Never put map / LLM / Clerk secret keys in client bundles. Proxy Places/Routes/translation through the BFF.

---

## i18n

- Default locale: **zh-CN**; full **en** table in `packages/i18n`.
- Web reads `bp_locale` cookie (falls back to zh-CN).
- Mobile shell currently hardcodes zh-CN; wire device locale in a later PR.

---

## Auth (Clerk)

Slice A documents env vars and shows a non-functional Sign-in control.  
MVP auth: Email / Apple / Google first, then WeChat via Clerk connector (compliance may trail).

---

## License / ownership

Private product scaffold for Beaver Plan. Not related to TapFeet IME — keep codebases separate.
