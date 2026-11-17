"use client";

import { useSignIn } from "@clerk/nextjs/legacy";
import type { OAuthStrategy } from "@clerk/types";
import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@beaver/i18n";

/** Clerk Dashboard WeChat social connection — not in published OAuthProvider union yet. */
const WECHAT_STRATEGY = "oauth_wechat" as OAuthStrategy;

/**
 * Honors `/sign-in?strategy=oauth_wechat` by starting Clerk's WeChat OAuth redirect.
 * `strategy` is passed from the server page (avoids useSearchParams + Suspense).
 */
export function WeChatOAuthTrigger({
  locale,
  strategy,
}: {
  locale: Locale;
  strategy?: string | null;
}) {
  const { isLoaded, signIn } = useSignIn();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const wantsWechat = strategy === "oauth_wechat";

  useEffect(() => {
    if (!wantsWechat) return;
    if (!isLoaded || !signIn || started.current) return;
    started.current = true;
    void (async () => {
      try {
        await signIn.authenticateWithRedirect({
          strategy: WECHAT_STRATEGY,
          redirectUrl: "/sign-in/sso-callback",
          redirectUrlComplete: "/trips",
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t(locale, "auth.wechatStartFailed");
        setError(message);
        started.current = false;
      }
    })();
  }, [isLoaded, locale, signIn, wantsWechat]);

  if (!wantsWechat) return null;

  return (
    <p className="mt-3 text-sm text-river" role="status">
      {error ?? t(locale, "auth.wechatStarting")}
    </p>
  );
}
