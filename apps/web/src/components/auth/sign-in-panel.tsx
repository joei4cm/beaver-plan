"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { apiGet } from "@/lib/api";
import { WeChatOAuthTrigger } from "./wechat-oauth-trigger";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/**
 * Lumen Route sign-in chrome: azure hierarchy · SoftFailNotice when Clerk/API
 * absent · never timber for keys-missing / transport noise.
 */
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
  const [apiSoft, setApiSoft] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiGet<{ status?: string }>("/health")
      .then(() => {
        if (!cancelled) setApiSoft(false);
      })
      .catch(() => {
        if (!cancelled) setApiSoft(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const softCopy = !clerkReady
    ? t(locale, "auth.demoNotice")
    : apiSoft
      ? t(locale, "auth.softOffline")
      : null;

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

      <header className="animate-rise max-w-xl">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
          {t(locale, "auth.eyebrow")} · {brand.en}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {t(locale, "nav.signIn")}
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
          {t(locale, "auth.support")}
        </p>
      </header>

      <SoftFailNotice open={Boolean(softCopy)} className="mt-8 max-w-xl">
        {softCopy ?? ""}
      </SoftFailNotice>

      <div
        className="animate-rise mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start"
        style={{ animationDelay: "120ms" }}
      >
        <div className="space-y-8">
          <section aria-labelledby="auth-providers-heading">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
              {t(locale, "auth.providersEyebrow")}
            </p>
            <h2
              id="auth-providers-heading"
              className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink"
            >
              {t(locale, "nav.signIn")}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
              {t(locale, "auth.providers")}
            </p>
            {wechatEnabled ? (
              <p className="mt-3 text-sm font-medium text-river">
                {t(locale, "auth.wechatReady")}
              </p>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                {t(locale, "auth.wechatHint")}
              </p>
            )}
            {clerkReady && wechatEnabled ? (
              <Link
                href="/sign-in?strategy=oauth_wechat"
                className={`mt-4 inline-flex rounded-bp-sm border border-river/40 bg-foam/80 px-3.5 py-2 text-sm font-semibold text-river bp-transition hover:border-river hover:bg-foam ${FOCUS}`}
              >
                {t(locale, "auth.wechat")}
              </Link>
            ) : null}
          </section>

          <Link
            href="/trips"
            className={`inline-flex text-sm font-semibold text-river bp-transition hover:underline ${FOCUS}`}
          >
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
            <DemoAuthSheet locale={locale} />
          )}
        </div>
      </div>
    </section>
  );
}

function DemoAuthSheet({ locale }: { locale: Locale }) {
  return (
    <div
      className="animate-rise overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/80 shadow-bp"
      aria-labelledby="auth-demo-heading"
    >
      <div className="border-b border-[color:var(--bp-line)] bg-paper/70 px-5 py-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
          {t(locale, "auth.setupEyebrow")}
        </p>
      </div>
      <div className="space-y-5 px-5 py-5">
        <div>
          <h2
            id="auth-demo-heading"
            className="font-display text-2xl font-semibold tracking-tight text-ink"
          >
            {t(locale, "auth.demoTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {t(locale, "auth.demoBody")}
          </p>
        </div>
        <ol className="list-decimal space-y-2.5 border-t border-[color:var(--bp-line)] pt-4 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>{t(locale, "auth.demoStep1")}</li>
          <li>{t(locale, "auth.demoStep2")}</li>
          <li>{t(locale, "auth.demoStep3")}</li>
        </ol>
        <Link
          href="/trips/sample-kyoto"
          className={`inline-flex rounded-bp bg-river px-4 py-2.5 text-sm font-semibold text-foam bp-transition hover:bg-river-deep ${FOCUS}`}
        >
          {t(locale, "trips.openSample")}
        </Link>
      </div>
    </div>
  );
}
