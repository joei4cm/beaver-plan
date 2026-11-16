export type Bindings = {
  APP_NAME: string;
  DEFAULT_LOCALE: string;
  DEFAULT_MAP_ENGINE: string;
  MAP_AUTO_AMAP_CN: string;
  FEATURE_TRANSLATION: string;
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
};

export type { AuthVariables as AppVariables } from "./auth.js";
