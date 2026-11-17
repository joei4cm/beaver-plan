export type Bindings = {
  APP_NAME: string;
  DEFAULT_LOCALE: string;
  DEFAULT_MAP_ENGINE: string;
  MAP_AUTO_AMAP_CN: string;
  FEATURE_TRANSLATION: string;
  /**
   * Neon / Postgres connection string (required for trip/journal/member persistence).
   * Local: apps/api/.dev.vars — Prod: `wrangler secret put DATABASE_URL`
   */
  DATABASE_URL?: string;
  /**
   * S3-compatible object storage (Cloudflare R2 via S3 API tokens).
   * Prefer S3_*; R2_* aliases accepted. Missing → /v1/media* returns 503.
   */
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_PUBLIC_BASE_URL?: string;
  /** Alias: builds endpoint https://{id}.r2.cloudflarestorage.com */
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_REGION?: string;
  R2_PUBLIC_BASE_URL?: string;
  /** When set (real sk_…), trip mutations require a Clerk Bearer JWT. */
  CLERK_SECRET_KEY?: string;
  /** Optional; used with jose to derive JWKS issuer if CLERK_JWT_ISSUER unset. */
  CLERK_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  /** e.g. https://your-app.clerk.accounts.dev */
  CLERK_JWT_ISSUER?: string;
  /** Surface WeChat OAuth entry in clients when "true". */
  CLERK_WECHAT_ENABLED?: string;
  NEXT_PUBLIC_CLERK_WECHAT_ENABLED?: string;
  /** Public web origin for invite URLs (no trailing slash). */
  PUBLIC_WEB_ORIGIN?: string;
  GOOGLE_MAPS_SERVER_KEY?: string;
  AMAP_SERVER_KEY?: string;
  /** 百度地图开放平台 — 服务端 AK（Web服务）；缺省则 Baidu 走 demo. */
  BAIDU_MAP_SERVER_KEY?: string;
  /** OpenAI-compatible API key (LLM / Whisper / TTS / vision). */
  OPENAI_API_KEY?: string;
  /** Optional OpenAI-compatible base, e.g. https://api.openai.com/v1 */
  OPENAI_BASE_URL?: string;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_ASR_MODEL?: string;
  OPENAI_TTS_MODEL?: string;
  OPENAI_TTS_VOICE?: string;
  DEEPGRAM_API_KEY?: string;
  /** openai | deepgram | demo | auto */
  ASR_PROVIDER?: string;
  /** openai | demo | auto */
  LLM_PROVIDER?: string;
  /** openai | edge | demo | auto */
  TTS_PROVIDER?: string;
  /**
   * OTA / booking search stub — optional.
   * Without keys: curated demo hotels/activities.
   * With keys: mode "configured" (still mock catalog until a live adapter is wired).
   * Never put real secrets in git — use wrangler secrets / .dev.vars locally.
   */
  /** amadeus | booking | demo | auto */
  OTA_PROVIDER?: string;
  AMADEUS_API_KEY?: string;
  AMADEUS_API_SECRET?: string;
  /** Booking.com affiliate aid (document / stub only). */
  BOOKING_AFFILIATE_ID?: string;
};

export type { AuthVariables as AppVariables } from "./auth.js";
