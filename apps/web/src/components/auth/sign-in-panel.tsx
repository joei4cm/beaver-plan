"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";
import { WeChatOAuthTrigger } from "./wechat-oauth-trigger";

export function SignInPanel({
  locale,
  clerkReady,
  wechatEnabled,
  oauthStrategy,
}: {
  locale: Locale;
  clerkReady: boolean;
  wechatEnabled: boolean;
  /** From `/sign-in?strategy=` — e.g. oauth_wechat */
  oauthStrategy?: string | null;
}) {
  const brandName = locale === "zh-CN" ? brand.zh : brand.en;

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-5xl flex-col justify-center px-6 py-16 md:px-10">
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute inset-0 -z-10 opacity-80"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 50% at 20% 20%, rgba(47,107,255,0.16), transparent 55%),
            radial-gradient(ellipse 50% 40% at 90% 10%, rgba(96,165,250,0.12), transparent 50%),
            linear-gradient(180deg, #dbe8ff 0%, transparent 65%)
          `,
        }}
      />

      <p className="animate-fade text-xs uppercase tracking-[0.2em] text-river/80">
        {brand.en}
      </p>
      <h1 className="animate-rise mt-3 font-display text-4xl tracking-tight text-ink md:text-5xl">
        {brandName}
      </h1>
      <p
        className="animate-rise mt-4 max-w-md text-ink-soft"
        style={{ animationDelay: "60ms" }}
      >
        {t(locale, "auth.support")}
      </p>

      <div
        className="animate-rise mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start"
        style={{ animationDelay: "120ms" }}
      >
        <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
          <p>{t(locale, "auth.providers")}</p>
          {wechatEnabled ? (
            <p className="text-river">{t(locale, "auth.wechatReady")}</p>
          ) : (
            <p>{t(locale, "auth.wechatHint")}</p>
          )}
          {clerkReady && wechatEnabled && (
            <Link
              href="/sign-in?strategy=oauth_wechat"
              className="inline-flex rounded-bp-sm border border-river/40 bg-foam/80 px-3 py-2 text-river transition hover:border-river hover:bg-foam"
            >
              {t(locale, "auth.wechat")}
            </Link>
          )}
          <Link href="/trips" className="block text-river hover:underline">
            ← {t(locale, "nav.trips")}
          </Link>
        </div>

        <div className="min-h-[320px]">
          {clerkReady ? (
            <>
              <WeChatOAuthTrigger locale={locale} strategy={oauthStrategy} />
              <SignIn
                routing="path"
                path="/sign-in"
                signUpUrl="/sign-in"
                fallbackRedirectUrl="/trips"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    card: "shadow-none border border-[color:var(--bp-line)] bg-foam/80",
                  },
                }}
              />
            </>
          ) : (
            <div className="rounded-bp border border-[color:var(--bp-line)] bg-foam/70 p-6">
              <p className="font-display text-xl text-ink">
                {t(locale, "auth.demoTitle")}
              </p>
              <p className="mt-3 text-sm text-ink-soft">
                {t(locale, "auth.demoBody")}
              </p>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
                <li>{t(locale, "auth.demoStep1")}</li>
                <li>{t(locale, "auth.demoStep2")}</li>
                <li>{t(locale, "auth.demoStep3")}</li>
              </ol>
              <Link
                href="/trips/sample-kyoto"
                className="mt-6 inline-flex rounded-bp bg-river px-4 py-2.5 text-sm text-foam transition hover:bg-river-deep"
              >
                {t(locale, "trips.openSample")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
