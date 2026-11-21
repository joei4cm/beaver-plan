"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import { t, type Locale } from "@beaver/i18n";
import { clerkEnabled, wechatLoginEnabled } from "@/lib/clerk";

const CHIP =
  "rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/70 px-3 py-1.5 text-sm text-ink-soft bp-transition hover:border-river/40 hover:text-river focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/** Header auth chrome — azure chips; demo link when Clerk keys unset. */
export function AuthControls({ locale }: { locale: Locale }) {
  if (!clerkEnabled()) {
    return (
      <Link
        href="/sign-in"
        className={CHIP}
        title={t(locale, "auth.demoNotice")}
      >
        {t(locale, "nav.signIn")}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className={CHIP}>
            {t(locale, "nav.signIn")}
          </button>
        </SignInButton>
        {wechatLoginEnabled() ? (
          <Link
            href="/sign-in?strategy=oauth_wechat"
            className="text-xs font-semibold text-river underline-offset-2 bp-transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            {t(locale, "auth.wechat")}
          </Link>
        ) : null}
      </SignedOut>
      <SignedIn>
        <UserButton />
        <SignOutButton>
          <button
            type="button"
            className="text-xs text-ink-soft/70 bp-transition hover:text-river focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            {t(locale, "auth.signOut")}
          </button>
        </SignOutButton>
      </SignedIn>
    </div>
  );
}
