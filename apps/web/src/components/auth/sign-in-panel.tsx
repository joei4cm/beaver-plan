"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashClass,
} from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
import { apiGet } from "@/lib/api";
import { clerkEmailElements } from "./clerk-email-appearance";
import { WeChatOAuthTrigger } from "./wechat-oauth-trigger";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/**
 * Sign-in / WeChat sheet — SoftFail depth kept (BEA-392 / BEA-421 / #238) +
 * wave 49 WeChat chrome (BEA-472) + wave 52 Clerk email sheet (BEA-498) +
 * wave 54 auth landing residual (BEA-522): tip-011 secondary links ·
 * display leading-snug. SoftFailBadge · SoftFailSupport · mist · WeChat
 * SoftFail yield unchanged. Craft: /sign-in?signInSoftFail=1 — SoftFail copy
 * never timber / Failed to fetch. No `/dev` gallery.
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
  /** Child WeChat SoftFail ownership — parent SoftFail yields while open. */
  const [wechatOwnsSoft, setWechatOwnsSoft] = useState(false);
  /** Craft preview: /sign-in?signInSoftFail=1 — SoftFail depth under azure rail. */
  const [signInSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("signInSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });

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

  /**
   * SoftFail owned by sign-in sheet — never timber / Failed to fetch.
   * Craft `?signInSoftFail=1` forces SoftFail depth without a Clerk/API miss.
   */
  const softCopy = signInSoftPreview
    ? t(locale, "auth.signInSoftFail")
    : !clerkReady
      ? t(locale, "auth.signInSoftFail")
      : apiSoft
        ? t(locale, "auth.signInApiSoftFail")
        : null;
  const softOpen = Boolean(softCopy);
  /** Parent SoftFail yields while WeChat child SoftFail owns (no double depth). */
  const sheetSoftOpen = softOpen && !wechatOwnsSoft;

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-5xl flex-col justify-center px-6 py-16 md:px-10">
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute inset-0 -z-10 opacity-80"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 72% 52% at 18% 18%, color-mix(in srgb, var(--bp-river) 16%, transparent), transparent 55%),
            radial-gradient(ellipse 48% 38% at 92% 8%, color-mix(in srgb, var(--bp-focus) 14%, transparent), transparent 50%),
            linear-gradient(180deg, color-mix(in srgb, var(--bp-river) 18%, var(--bp-foam)) 0%, transparent 68%)
          `,
        }}
      />

      <header className="animate-rise max-w-xl">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
          {t(locale, "auth.eyebrow")} · {brand.en}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-snug tracking-tight text-ink md:text-5xl">
          {t(locale, "nav.signIn")}
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
          {t(locale, "auth.support")}
        </p>
      </header>

      {/*
        SoftFail kept (BEA-392 / BEA-421) + WeChat chrome (BEA-472) + Clerk
        email sheet (BEA-498): Lumen sky · 0.18em eyebrows · tip-011 CTA /
        email primary. SoftFailBadge · SoftFailSupport · mist · WeChat yield.
        Craft: ?signInSoftFail=1 — never timber.
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
            {softOpen || wechatOwnsSoft ? (
              <SoftFailSupport>{t(locale, "auth.softSupport")}</SoftFailSupport>
            ) : (
              <span className="text-[11px] leading-snug text-ink-soft/80">
                {t(locale, "auth.sheetSupport")}
              </span>
            )}
          </div>
          {softOpen || wechatOwnsSoft ? (
            <SoftFailBadge>{t(locale, "auth.signInSoftBadge")}</SoftFailBadge>
          ) : (
            <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
              {t(locale, "auth.liveBadge")}
            </SoftFailLiveBadge>
          )}
        </header>

        {/* Compact SoftFail under azure rail — yields while WeChat child owns. */}
        <SoftFailNotice open={sheetSoftOpen} compact>
          {softCopy ?? ""}
        </SoftFailNotice>

        <SheetPresence
          open
          role="group"
          className={`space-y-8 px-4 py-6 sm:px-5 sm:py-8 ${
            sheetSoftOpen ? softFailMistWashClass : ""
          }`}
          style={{ animationDelay: "40ms" }}
          aria-label={t(locale, "nav.signIn")}
        >
          <div
            className="animate-rise grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start"
            style={{ animationDelay: "120ms" }}
          >
            <div className="space-y-8">
              <section
                className={`rounded-bp-sm bg-gradient-to-br from-mist/45 via-mist/20 to-transparent p-4 shadow-[inset_3px_0_0_var(--bp-river)] sm:p-5 ${
                  sheetSoftOpen ? "bg-mist/55" : ""
                }`}
                aria-labelledby="auth-providers-heading"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                  {t(locale, "auth.providersEyebrow")}
                </p>
                <h2
                  id="auth-providers-heading"
                  className="mt-3 font-display text-2xl font-semibold leading-snug tracking-tight text-ink"
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
                    className={`mt-4 inline-flex rounded-bp-sm border border-river/40 bg-foam/80 px-3.5 py-2 text-sm font-semibold text-river transition duration-bp-fast ease-bp-out hover:border-river hover:bg-foam active:scale-[0.98] ${FOCUS}`}
                  >
                    {t(locale, "auth.wechat")}
                  </Link>
                ) : null}
              </section>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-0.5">
                <Link
                  href="/sign-up"
                  className={`inline-flex text-sm font-semibold text-river transition duration-bp-fast ease-bp-out hover:underline active:scale-[0.98] ${FOCUS}`}
                >
                  {t(locale, "auth.needAccount")}
                </Link>
                <Link
                  href="/trips"
                  className={`inline-flex text-sm font-semibold text-ink-soft transition duration-bp-fast ease-bp-out hover:text-river hover:underline active:scale-[0.98] ${FOCUS}`}
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
                    onSoftFailChange={setWechatOwnsSoft}
                  />
                  <SignIn
                    routing="path"
                    path="/sign-in"
                    signUpUrl="/sign-up"
                    fallbackRedirectUrl="/trips"
                    appearance={{
                      elements: {
                        rootBox: clerkEmailElements.rootBox,
                        card: clerkEmailElements.card,
                        headerTitle: clerkEmailElements.headerTitle,
                        headerSubtitle: clerkEmailElements.headerSubtitle,
                        formFieldLabel: clerkEmailElements.formFieldLabel,
                        formFieldInput: clerkEmailElements.formFieldInput,
                        formButtonPrimary:
                          clerkEmailElements.formButtonPrimary,
                        footerActionLink: clerkEmailElements.footerActionLink,
                        formFieldAction: clerkEmailElements.formFieldAction,
                      },
                    }}
                  />
                </>
              ) : (
                <DemoAuthSheet locale={locale} soft={sheetSoftOpen} />
              )}
            </div>
          </div>
        </SheetPresence>
      </div>
    </section>
  );
}

function DemoAuthSheet({
  locale,
  soft,
}: {
  locale: Locale;
  soft?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/80 shadow-bp ${
        soft ? "bg-mist/40 shadow-[inset_3px_0_0_var(--bp-river)]" : ""
      }`}
      aria-labelledby="auth-demo-heading"
    >
      <div className="border-b border-[color:var(--bp-line)] bg-paper/70 px-5 py-3 shadow-[inset_3px_0_0_var(--bp-river)]">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
          {t(locale, "auth.setupEyebrow")}
        </p>
      </div>
      <div
        className={`space-y-5 px-5 py-5 ${
          soft ? softFailMistWashClass : ""
        }`}
      >
        <div>
          <h2
            id="auth-demo-heading"
            className="font-display text-2xl font-semibold leading-snug tracking-tight text-ink"
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
            className={`inline-flex rounded-bp bg-river px-4 py-2.5 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep active:scale-[0.98] ${FOCUS}`}
          >
            {t(locale, "trips.openSample")}
          </Link>
          <Link
            href="/sign-up"
            className={`inline-flex rounded-bp-sm border border-river/40 bg-foam/80 px-3.5 py-2.5 text-sm font-semibold text-river transition duration-bp-fast ease-bp-out hover:border-river hover:bg-foam active:scale-[0.98] ${FOCUS}`}
          >
            {t(locale, "nav.signUp")}
          </Link>
        </div>
      </div>
    </div>
  );
}
