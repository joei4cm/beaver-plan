"use client";

import { useSignIn } from "@clerk/nextjs/legacy";
import type { OAuthStrategy } from "@clerk/types";
import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";

/** Clerk Dashboard WeChat social connection — not in published OAuthProvider union yet. */
const WECHAT_STRATEGY = "oauth_wechat" as OAuthStrategy;

/**
 * Honors `/sign-in?strategy=oauth_wechat` by starting Clerk's WeChat OAuth redirect.
 * SoftFailNotice on failure — never timber / raw transport noise.
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
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const wantsWechat = strategy === "oauth_wechat";

  useEffect(() => {
    if (!wantsWechat) return;
    if (!isLoaded || !signIn || started.current) return;
    started.current = true;
    setStarting(true);
    setFailed(false);
    void (async () => {
      try {
        await signIn.authenticateWithRedirect({
          strategy: WECHAT_STRATEGY,
          redirectUrl: "/sign-in/sso-callback",
          redirectUrlComplete: "/trips",
        });
      } catch {
        setFailed(true);
        setStarting(false);
        started.current = false;
      }
    })();
  }, [isLoaded, signIn, wantsWechat]);

  if (!wantsWechat) return null;

  return (
    <div className="mb-4 space-y-2">
      {starting && !failed ? (
        <p className="animate-fade text-sm text-river" role="status">
          {t(locale, "auth.wechatStarting")}
        </p>
      ) : null}
      <SoftFailNotice open={failed}>
        {t(locale, "auth.wechatStartFailed")}
      </SoftFailNotice>
    </div>
  );
}
