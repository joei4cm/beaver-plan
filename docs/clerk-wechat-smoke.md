# Clerk + WeChat login smoke (Michael runbook)

Live-integration step 3. No secrets in chat or git — only local `.env` / Wrangler secrets.

Canonical env templates: [`.env.example`](../.env.example), [`apps/api/.dev.vars.example`](../apps/api/.dev.vars.example).  
Full keys checklist: [`keys-integration.md`](./keys-integration.md#1-clerk-web--expo--wechat).

---

## 0. Dry-run (no secrets)

```bash
pnpm smoke:clerk
# or: pnpm --filter @beaver/api smoke:clerk -- --dry-run
```

Prints this checklist and verifies scaffolding (auth, `/sign-in`, WeChat trigger, Expo sign-in). Exits 0 without network.

---

## 1. Env vars

| Surface | File / place | Vars |
|---------|--------------|------|
| Web | `apps/web/.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_WECHAT_ENABLED` |
| API | `apps/api/.dev.vars` | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` **or** `CLERK_JWT_ISSUER`, `CLERK_WECHAT_ENABLED`, `PUBLIC_WEB_ORIGIN` |
| Expo | shell / Metro `.env` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CLERK_WECHAT_ENABLED`, `EXPO_PUBLIC_API_BASE_URL` |

```bash
cp .env.example apps/web/.env.local
# merge Clerk lines into apps/api/.dev.vars from apps/api/.dev.vars.example
```

**Wiring rule:** API Clerk mode needs **secret + issuer**. Issuer comes from `CLERK_JWT_ISSUER` or is derived from `CLERK_PUBLISHABLE_KEY`. Secret alone stays in **demo** (`/health` → `auth.note` explains).

Without keys: demo identity (`X-Beaver-User-Id` → `demo-user`) still works.

Restart after every env change: `pnpm dev:api` / `pnpm dev:web` / `pnpm dev:mobile`.

---

## 2. WeChat social connection (Dashboard only)

WeChat AppID / AppSecret live in **Clerk + WeChat Open Platform** — never in this repo.

1. [dashboard.clerk.com](https://dashboard.clerk.com) → **User & Authentication → Social connections → WeChat**.
2. Paste WeChat Open Platform AppID + AppSecret into Clerk.
3. Copy Clerk’s callback URL into WeChat Open Platform **authorized redirect URIs**.
4. Enable the connection, then set:
   - `NEXT_PUBLIC_CLERK_WECHAT_ENABLED=true`
   - `EXPO_PUBLIC_CLERK_WECHAT_ENABLED=true`
   - `CLERK_WECHAT_ENABLED=true` → `/health` → `auth.wechatUi: true`
5. Web: `/sign-in` shows WeChat; `/sign-in?strategy=oauth_wechat` starts OAuth redirect.  
   Mobile: home → sign-in → WeChat button when the Expo flag is on.

---

## 3. Sign-in route checks

| Check | Expect |
|-------|--------|
| No Clerk keys | Web `/sign-in` → demo instructions; Mobile `/sign-in` → demo copy; `/health` → `auth.mode: "demo"` |
| Keys set | `/health` → `auth.clerk: true`, `jwtIssuerConfigured: true`, `mode: "clerk"` |
| Web signed in | Bearer JWT on trip mutations; unsigned invite → **401** |
| WeChat flags on | UI WeChat entry; OAuth completes via Clerk (`/sign-in/sso-callback` under catch-all) |

```bash
pnpm dev:api
pnpm dev:web
curl -s http://127.0.0.1:8787/health | jq '.auth'
# open http://localhost:3000/sign-in
# optional: http://localhost:3000/sign-in?strategy=oauth_wechat
```

---

## 4. Live smoke script

```bash
# API + optional web route
API_BASE_URL=http://127.0.0.1:8787 WEB_BASE_URL=http://localhost:3000 pnpm smoke:clerk

# After keys + WeChat flags (fail if not live):
EXPECT_CLERK=1 EXPECT_WECHAT=1 API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:clerk

# Optional: paste a short-lived Clerk session JWT (value never printed)
CLERK_SMOKE_JWT=… API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:clerk
```

Prod: `wrangler secret put CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` (see [`deploy-cloudflare.md`](./deploy-cloudflare.md)). Set `CLERK_WECHAT_ENABLED=true` in `wrangler.toml` `[env.*.vars]` when WeChat UI should show.

---

## 5. Pass / fail matrix

| # | Check | Pass |
|---|-------|------|
| 1 | `pnpm smoke:clerk` dry-run | exits 0 |
| 2 | `/health` without keys | `mode: "demo"` |
| 3 | `/health` with secret+issuer | `mode: "clerk"`, `jwtIssuerConfigured: true` |
| 4 | `/sign-in` | 200 (or Clerk middleware redirect &lt;400) |
| 5 | Unsigned invite in clerk mode | 401 |
| 6 | Bearer JWT (optional) | members read 200 |
| 7 | WeChat flags | `wechatUi: true` + UI entry web/mobile |
