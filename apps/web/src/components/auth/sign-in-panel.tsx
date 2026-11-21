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
 * Sign-in SoftFailNotice chrome (BEA-274 after #115/#168/#190):
 * azure sheet rail · Soft sign-in badge · compact SoftFail under rail ·
 * tip-011 rise stagger — never timber / Failed to fetch for keys-missing /
 * transport noise.
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

  /** SoftFail owned by sign-in sheet — never timber / Failed to fetch. */
  const softCopy = !clerkReady
    ? t(locale, "auth.signInSoftFail")
    : apiSoft
      ? t(locale, "auth.signInApiSoftFail")
      : null;
  const softOpen = Boolean(softCopy);

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-5xl flex-col justify-center px-6 py-16 md:px-10">
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute inset-0 -z-10 opacity-80"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 72% 52% at 18% 18%, rgba(47,107,255,0.18), transparent 55%),
            radial-gradient(ellipse 48% 38% at 92% 8%, rgba(96,165,250,0.14), transparent 50%),
            linear-gradient(180deg, #dbe8ff 0%, transparent 68%)
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

      {/*
        SoftFail sheet (BEA-274 after #115/#168/#190):
        azure rail · Soft sign-in badge · compact SoftFailNotice · tip-011 —
        never timber.
      */}
      <div
        className="animate-rise mt-10 overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft"
        style={{ animationDelay: "60ms" }}
        aria-label={t(locale, "nav.signIn")}
      >
        <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)] sm:px-5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
              {t(locale, "auth.sheetEyebrow")}
            </span>
            <span className="text-[11px] leading-snug text-ink-soft/80">
              {t(locale, "auth.sheetSupport")}
            </span>
          </div>
          <span
            className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
              softOpen
                ? "bg-mist text-ink-soft"
                : "bg-river/12 text-river"
            }`}
          >
            {softOpen
              ? t(locale, "auth.signInSoftBadge")
              : t(locale, "auth.liveBadge")}
          </span>
        </header>

        {/* Compact SoftFail under azure rail — never timber / Failed to fetch. */}
        <SoftFailNotice
          open={softOpen}
          compact
          className="border-b border-[color:var(--bp-line)]"
        >
          {softCopy ?? ""}
        </SoftFailNotice>

        <div className="space-y-8 px-4 py-6 sm:px-5 sm:py-8">
          <div
            className="animate-rise grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start"
            style={{ animationDelay: "120ms" }}
          >
            <div className="space-y-8">
              <section
                className="rounded-bp-sm bg-gradient-to-br from-mist/45 via-mist/20 to-transparent p-4 shadow-[inset_3px_0_0_var(--bp-river)] sm:p-5"
                aria-labelledby="auth-providers-heading"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
                  {t(locale, "auth.providersEyebrow")}
                </p>
                <h2
                  id="auth-providers-heading"
                  className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink"
                >
                  {t(locale, "auth.providersTitle")}
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

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-0.5">
                <Link
                  href="/sign-up"
                  className={`inline-flex text-sm font-semibold text-river bp-transition hover:underline ${FOCUS}`}
                >
                  {t(locale, "auth.needAccount")}
                </Link>
                <Link
                  href="/trips"
                  className={`inline-flex text-sm font-semibold text-ink-soft bp-transition hover:text-river hover:underline ${FOCUS}`}
                >
                  ← {t(locale, "nav.trips")}
                </Link>
              </div>
            </div>

            <div
              className="animate-rise min-h-[320px]"
              style={{ animationDelay: "200ms" }}
            >
              {clerkReady ? (
                <>
                  <WeChatOAuthTrigger
                    locale={locale}
                    strategy={oauthStrategy}
                  />
                  <SignIn
                    routing="path"
                    path="/sign-in"
                    signUpUrl="/sign-up"
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
        </div>
      </div>
    </section>
  );
}

function DemoAuthSheet({ locale }: { locale: Locale }) {
  return (
    <div
      className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/80 shadow-bp"
      aria-labelledby="auth-demo-heading"
    >
      <div className="border-b border-[color:var(--bp-line)] bg-paper/70 px-5 py-3 shadow-[inset_3px_0_0_var(--bp-river)]">
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
        <div className="flex flex-wrap gap-3">
          <Link
            href="/trips/sample-kyoto"
            className={`inline-flex rounded-bp bg-river px-4 py-2.5 text-sm font-semibold text-foam bp-transition hover:bg-river-deep ${FOCUS}`}
          >
            {t(locale, "trips.openSample")}
          </Link>
          <Link
            href="/sign-up"
            className={`inline-flex rounded-bp-sm border border-river/40 bg-foam/80 px-3.5 py-2.5 text-sm font-semibold text-river bp-transition hover:border-river hover:bg-foam ${FOCUS}`}
          >
            {t(locale, "nav.signUp")}
          </Link>
        </div>
      </div>
    </div>
  );
}
