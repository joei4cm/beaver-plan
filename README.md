# Beaver Plan / 海狸旅行

Map-first travel OS — plan on a beautiful map, walk real routes, journal on the road, share, translate, collaborate.

**Brand:** Beaver Plan / 海狸旅行  
**Repo:** https://github.com/joei4cm/beaver-plan  
**Slice:** E — Live translation (ASR → LLM → TTS + camera assist)

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
| Kyoto planner / journal / share / collab | ✅ | — | ✅ when keyed |

---

## Maps keys (Google + Amap)

Secrets in **`apps/api/.dev.vars`**. Without them, Places + Directions use curated demo POIs.

---

## Cloudflare deploy notes

Hosting is **Cloudflare only** (Workers + R2; no VPS).

```bash
cd apps/api
pnpm exec wrangler secret put OPENAI_API_KEY
# optional: DEEPGRAM_API_KEY, CLERK_*, GOOGLE_MAPS_SERVER_KEY, AMAP_SERVER_KEY
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
