# Maps keys smoke — Google / Amap / Baidu (Michael runbook)

Live-integration step 4. No secrets in chat or git — only local `.dev.vars` / Wrangler secrets.

Canonical env templates: [`.env.example`](../.env.example), [`apps/api/.dev.vars.example`](../apps/api/.dev.vars.example).  
Full keys checklist: [`keys-integration.md`](./keys-integration.md#2-google-maps--amap--baidu-mainland-auto-switch).

---

## 0. Dry-run (no secrets)

```bash
pnpm smoke:maps
# or: pnpm --filter @beaver/api smoke:maps -- --dry-run
```

Prints this checklist and verifies scaffolding (maps routes, Google/Amap/Baidu engines, env templates). Exits 0 without network.

---

## 1. Env vars (API only)

Server keys stay in **`apps/api/.dev.vars`** — never in Next / Expo bundles.

| Var | Purpose |
|-----|---------|
| `GOOGLE_MAPS_SERVER_KEY` | Places API (New) + Routes API |
| `AMAP_SERVER_KEY` | 高德 Web服务 key |
| `BAIDU_MAP_SERVER_KEY` | 百度 Web服务 AK (Place v2 + DirectionLite) |
| `DEFAULT_MAP_ENGINE=auto` | Product default; `auto` → Google outside CN, Amap in mainland |
| `MAP_AUTO_AMAP_CN=true` | Enable mainland CN → Amap heuristic |

```bash
# apps/api/.dev.vars (values never committed)
GOOGLE_MAPS_SERVER_KEY=…
AMAP_SERVER_KEY=…
BAIDU_MAP_SERVER_KEY=…
DEFAULT_MAP_ENGINE=auto
MAP_AUTO_AMAP_CN=true
```

**Rules**

- Missing key → that engine stays **`mode: "demo"`** (curated Kyoto / CN POIs).
- **Baidu is never chosen by `auto`** — set trip `mapEngine` / query `preference=baidu`.
- Optional browser/native SDK keys in `.env.example` are reserved; BFF is source of truth today.

Restart after every env change: `pnpm dev:api`.

---

## 2. Live smoke

```bash
pnpm dev:api   # http://127.0.0.1:8787

# Accepts demo or live per key presence:
API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:maps

# Fail closed when keys are expected live:
EXPECT_LIVE=1 EXPECT_GOOGLE=1 EXPECT_AMAP=1 EXPECT_BAIDU=1 \
  API_BASE_URL=http://127.0.0.1:8787 pnpm smoke:maps
```

| Check | Expect |
|-------|--------|
| `GET /health` | `maps.google` / `maps.amap` / `maps.baidu` booleans; `defaultEngine`; `autoAmapCn` |
| `preference=auto&timezone=Asia/Shanghai` | `engineId: "amap"`, `region: "mainland_cn"` (when `MAP_AUTO_AMAP_CN=true`) |
| `preference=auto&timezone=America/Los_Angeles` | `engineId: "google"`, `region: "other"` |
| `preference=google` / `amap` / `baidu` | Manual override always wins |
| `GET /v1/places/search?engine=…` | Non-empty `places`; `mode: live` with key, else `demo` |
| `POST /v1/directions` with `engine` | `route` present; same mode rule |

Manual curls (no secrets printed):

```bash
curl -s 'http://127.0.0.1:8787/health' | jq '.maps'
curl -s 'http://127.0.0.1:8787/v1/maps/engine?preference=auto&timezone=Asia/Shanghai'
curl -s 'http://127.0.0.1:8787/v1/places/search?q=%E6%B8%85%E6%B0%B4%E5%AF%BA&engine=google&lat=34.99&lng=135.78'
curl -s -X POST http://127.0.0.1:8787/v1/directions \
  -H 'content-type: application/json' \
  -d '{"origin":{"lat":31.2404,"lng":121.4905},"destination":{"lat":31.2272,"lng":121.4921},"mode":"walk","engine":"amap"}'
```

UI: open `/trips/sample-kyoto` — map SVG + stops render; Places search / directions use the BFF engines above.

---

## 3. Production (Wrangler)

```bash
cd apps/api
ENV=preview   # or production
pnpm exec wrangler secret put GOOGLE_MAPS_SERVER_KEY --env "$ENV"
pnpm exec wrangler secret put AMAP_SERVER_KEY --env "$ENV"
pnpm exec wrangler secret put BAIDU_MAP_SERVER_KEY --env "$ENV"
# DEFAULT_MAP_ENGINE / MAP_AUTO_AMAP_CN are non-secret vars in wrangler.toml
pnpm --filter @beaver/api deploy:preview
API_BASE_URL=https://beaver-plan-api-preview.<subdomain>.workers.dev pnpm smoke:maps
```

---

## Pass matrix

| # | Command | Pass |
|---|---------|------|
| 1 | `pnpm smoke:maps` dry-run | exits 0 |
| 2 | `API_BASE_URL=… pnpm smoke:maps` without keys | engine preference + demo places/directions OK |
| 3 | Same with keys | `/health` flags true; places/directions `mode: live` |
| 4 | `EXPECT_LIVE=1` + keyed | fails if any keyed engine stays demo |
