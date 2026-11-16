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
};

export type { AuthVariables as AppVariables } from "./auth.js";
