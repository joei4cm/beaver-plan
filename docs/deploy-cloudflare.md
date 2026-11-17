# Deploy on Cloudflare (Workers + Pages)

Beaver Plan hosts **API on Cloudflare Workers** and **web on Cloudflare Pages** (OpenNext). No VPS. Secrets stay in Wrangler / dashboard — never commit them or paste them into chat.

Related: [`keys-integration.md`](./keys-integration.md) (live keys + smoke matrix), [`apps/api/wrangler.toml`](../apps/api/wrangler.toml), [`apps/api/.dev.vars.example`](../apps/api/.dev.vars.example).

---

## Architecture

| Surface | Host | Config |
|---------|------|--------|
| **API** (`apps/api`) | Cloudflare Workers (Hono) | `wrangler.toml` — envs `preview` / `production` |
| **Media** | Cloudflare R2 via S3 API | Secrets `S3_*` / `R2_*` (not an R2 binding) |
| **DB** | Neon Postgres | Secret `DATABASE_URL` |
| **Web** (`apps/web`) | Cloudflare Pages via **OpenNext** | See [Web](#web-nextjs--cloudflare-pages--opennext) |
| **Mobile** | Expo | Point `EXPO_PUBLIC_API_BASE_URL` at the Worker URL |

---

## Prerequisites

1. Cloudflare account + [`wrangler` login](https://developers.cloudflare.com/workers/wrangler/commands/#login):
   ```bash
   cd apps/api
   pnpm exec wrangler login
   ```
2. Neon project + pooled `DATABASE_URL` (required for trip APIs).
3. R2 bucket + S3 API token (required for journal/share media).
4. Optional: Clerk, maps, OpenAI / Deepgram — see keys checklist.

No Cloudflare credentials in this repo. If you are not logged in, use **dry-run** only (below) — do not ask agents for account secrets.

---

## API — Wrangler environments

| Env | Worker name | Command | `BEAVER_ENV` |
|-----|-------------|---------|--------------|
| local (`wrangler dev`) | (dev) | `pnpm --filter @beaver/api dev` | `local` |
| **preview** | `beaver-plan-api-preview` | `pnpm --filter @beaver/api deploy:preview` | `preview` |
| **production** | `beaver-plan-api` | `pnpm --filter @beaver/api deploy:production` | `production` |

Non-secret vars (`APP_NAME`, `PUBLIC_WEB_ORIGIN`, map defaults, …) live in `[vars]` / `[env.*.vars]` in `wrangler.toml`. Update `PUBLIC_WEB_ORIGIN` to your real Pages URL before first client smoke.

### Dry-run (no account upload)

Compiles the Worker bundle and prints bindings — safe without Cloudflare auth:

```bash
pnpm --filter @beaver/api deploy:dry
# or: cd apps/api && pnpm exec wrangler deploy --dry-run --outdir=.wrangler/dry-run
```

Expect `Total Upload: …` and a bindings table. `.wrangler/` is gitignored by Wrangler defaults.

### Deploy

```bash
# Preview first
pnpm --filter @beaver/api deploy:preview

# Production
pnpm --filter @beaver/api deploy:production
# alias: pnpm --filter @beaver/api deploy
```

Worker URLs (after deploy):

- Preview: `https://beaver-plan-api-preview.<your-subdomain>.workers.dev`
- Production: `https://beaver-plan-api.<your-subdomain>.workers.dev`

Optional custom domain: Cloudflare dashboard → Workers → Triggers → Custom Domains, or `[[env.production.routes]]` in `wrangler.toml`.

---

## Secrets checklist

Put secrets **per environment**. Never put values in `wrangler.toml` or git.

```bash
cd apps/api
ENV=preview   # or: production

# Required
pnpm exec wrangler secret put DATABASE_URL --env "$ENV"
pnpm exec wrangler secret put S3_ENDPOINT --env "$ENV"          # or R2_ACCOUNT_ID
pnpm exec wrangler secret put S3_ACCESS_KEY_ID --env "$ENV"
pnpm exec wrangler secret put S3_SECRET_ACCESS_KEY --env "$ENV"
pnpm exec wrangler secret put S3_BUCKET --env "$ENV"
pnpm exec wrangler secret put S3_REGION --env "$ENV"             # usually "auto"

# Auth (optional — without these, demo identity headers)
pnpm exec wrangler secret put CLERK_SECRET_KEY --env "$ENV"
pnpm exec wrangler secret put CLERK_PUBLISHABLE_KEY --env "$ENV"
# pnpm exec wrangler secret put CLERK_JWT_ISSUER --env "$ENV"

# Maps (optional — demo POIs without)
pnpm exec wrangler secret put GOOGLE_MAPS_SERVER_KEY --env "$ENV"
pnpm exec wrangler secret put AMAP_SERVER_KEY --env "$ENV"
pnpm exec wrangler secret put BAIDU_MAP_SERVER_KEY --env "$ENV"

# LLM / ASR / TTS (optional — scripted demos without)
pnpm exec wrangler secret put OPENAI_API_KEY --env "$ENV"
# pnpm exec wrangler secret put DEEPGRAM_API_KEY --env "$ENV"

# OTA stub (optional)
# pnpm exec wrangler secret put AMADEUS_API_KEY --env "$ENV"
# pnpm exec wrangler secret put AMADEUS_API_SECRET --env "$ENV"
# pnpm exec wrangler secret put BOOKING_AFFILIATE_ID --env "$ENV"
```

List what is set (names only):

```bash
pnpm exec wrangler secret list --env preview
pnpm exec wrangler secret list --env production
```

Migrate Neon **before** relying on trip routes (same DB the secret points at):

```bash
pnpm --filter @beaver/api db:migrate
```

Also set non-secret `PUBLIC_WEB_ORIGIN` in `wrangler.toml` `[env.*.vars]` to the Pages origin, then redeploy so CORS + invite links match.

---

## Health check (no secret leak)

After deploy (or local `pnpm dev:api`):

```bash
curl -s https://beaver-plan-api.<subdomain>.workers.dev/health | jq .
# local: curl -s http://127.0.0.1:8787/health | jq .
```

`/health` returns **booleans and mode labels only**, for example:

| Field | Meaning |
|-------|---------|
| `deploy.env` | `local` \| `preview` \| `production` |
| `deploy.publicWebOrigin` | CORS / invite origin (not a secret) |
| `auth.clerk` / `auth.mode` | Clerk configured? `clerk` vs `demo` |
| `database.configured` | `DATABASE_URL` present |
| `media.configured` | S3/R2 credentials present |
| `maps.google` / `amap` / `baidu` | Map server keys present |
| `translation` / `dayFill` / `booking` | Provider mode + ids (no API keys) |

It never returns connection strings, API keys, or token material.

---

## Web (Next.js → Cloudflare Pages / OpenNext)

**Recommended path:** [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) → deploy the Next.js 15 app (`apps/web`) to **Cloudflare Pages** (or Workers with assets). Clerk middleware + App Router need a Node-compatible OpenNext adapter — plain `output: "export"` static export is **not** enough for this app.

Scaffold (operator — first time, on a machine with Cloudflare login):

```bash
cd apps/web
# Follow current OpenNext Cloudflare init for Next 15, e.g.:
#   pnpm add -D @opennextjs/cloudflare wrangler
#   npx opennextjs-cloudflare configure   # or project docs for your OpenNext version
# Set Pages env: NEXT_PUBLIC_API_BASE_URL=https://beaver-plan-api.<…>.workers.dev
#                NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_…   # if using Clerk
pnpm exec opennextjs-cloudflare build
pnpm exec wrangler pages deploy .open-next/assets --project-name=beaver-plan-web
# (exact artifact path / command follows the OpenNext version you pin — check its README)
```

Simpler interim for demos: keep `pnpm dev:web` locally and point it at a deployed Worker API via `NEXT_PUBLIC_API_BASE_URL`. Full Pages/OpenNext wiring can land in a follow-up PR once the API Worker URL is stable.

After the web origin exists:

1. Set `PUBLIC_WEB_ORIGIN` in the matching Worker env vars → redeploy API.
2. Extend R2 CORS `AllowedOrigins` with that origin (see README → Media / R2).
3. Point mobile `EXPO_PUBLIC_API_BASE_URL` at the Worker.

---

## Operator smoke (Michael)

With a Cloudflare account logged in via `wrangler login`:

1. `pnpm --filter @beaver/api deploy:dry` — confirm bundle + bindings.
2. Create Neon + R2; `wrangler secret put … --env preview` for required secrets.
3. `pnpm --filter @beaver/api db:migrate`
4. `pnpm --filter @beaver/api deploy:preview`
5. `curl -s https://beaver-plan-api-preview.<subdomain>.workers.dev/health | jq '{deploy,auth,database,media,maps}'`
6. Expect `database.configured` / `media.configured` true when secrets are set; never see secret values in the JSON.
7. When ready: repeat secrets + deploy for `--env production`.

Do **not** paste secret values into chat, PRs, or Agent Store docs.
