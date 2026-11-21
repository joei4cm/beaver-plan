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

export function AuthControls({ locale }: { locale: Locale }) {
  if (!clerkEnabled()) {
    return (
      <Link
        href="/sign-in"
        className="rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/70 px-3 py-1.5 text-ink-soft transition hover:border-river/40 hover:text-river"
        title="Clerk keys unset — demo identity"
      >
        {t(locale, "nav.signIn")}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/70 px-3 py-1.5 text-ink-soft transition hover:border-river/40 hover:text-river"
          >
            {t(locale, "nav.signIn")}
          </button>
        </SignInButton>
        {wechatLoginEnabled() && (
          <Link
            href="/sign-in?strategy=oauth_wechat"
            className="text-xs text-river underline-offset-2 hover:underline"
          >
            {t(locale, "auth.wechat")}
          </Link>
        )}
      </SignedOut>
      <SignedIn>
        <UserButton />
        <SignOutButton>
          <button
            type="button"
            className="text-xs text-ink-soft/70 transition hover:text-river"
          >
            {t(locale, "auth.signOut")}
          </button>
        </SignOutButton>
      </SignedIn>
    </div>
  );
}
