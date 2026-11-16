"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";
import { apiGet, apiSend } from "@/lib/api";
import { clerkEnabled } from "@/lib/clerk";

type Preview = {
  code: string;
  role: "editor" | "viewer";
  trip: {
    id: string;
    title: string;
    destination?: string;
    startDate?: string;
    endDate?: string;
  };
};

export function InviteAccept({
  code,
  locale,
}: {
  code: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [pending, startTransition] = useTransition();
  const brandName = locale === "zh-CN" ? brand.zh : brand.en;

  useEffect(() => {
    startTransition(() => {
      void apiGet<Preview>(`/v1/invites/${encodeURIComponent(code)}`)
        .then(setPreview)
        .catch((e: Error) => setError(e.message));
    });
  }, [code]);

  async function accept() {
    setJoining(true);
    setError(null);
    try {
      const res = await apiSend<{
        trip: { id: string };
        alreadyMember?: boolean;
      }>(`/v1/invites/${encodeURIComponent(code)}/accept`, "POST", {});
      router.push(`/trips/${res.trip.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "join_failed");
      setJoining(false);
    }
  }

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-3xl flex-col justify-center px-6 py-16 md:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: `
            linear-gradient(115deg, rgba(15,67,57,0.45) 0%, transparent 55%),
            radial-gradient(ellipse 60% 50% at 80% 20%, rgba(216,226,220,0.4), transparent 60%)
          `,
        }}
      />

      <p className="animate-fade text-xs uppercase tracking-[0.2em] text-river/80">
        {brandName}
      </p>
      <h1 className="animate-rise mt-3 font-display text-4xl tracking-tight text-ink md:text-5xl">
        {t(locale, "invite.title")}
      </h1>
      <p
        className="animate-rise mt-4 max-w-lg text-ink-soft"
        style={{ animationDelay: "70ms" }}
      >
        {t(locale, "invite.support")}
      </p>

      <div
        className="animate-rise mt-10 space-y-6"
        style={{ animationDelay: "120ms" }}
      >
        {pending && !preview && !error && (
          <p className="text-ink-soft">{t(locale, "invite.loading")}</p>
        )}
        {error && <p className="text-timber">{error}</p>}
        {preview && (
          <>
            <div className="border-y border-[color:var(--bp-line)] py-6">
              <p className="text-sm text-ink-soft">
                {preview.trip.destination ?? t(locale, "planner.trip")}
              </p>
              <p className="mt-1 font-display text-3xl text-ink">
                {preview.trip.title}
              </p>
              <p className="mt-3 text-sm text-ink-soft">
                {t(locale, "invite.asRole")}{" "}
                <span className="text-river">
                  {t(locale, `collab.role.${preview.role}`)}
                </span>
                {" · "}
                <code className="font-mono tracking-wider">{preview.code}</code>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={joining}
                onClick={() => void accept()}
                className="rounded-md bg-river px-5 py-3 text-sm font-medium text-foam transition hover:bg-river-deep disabled:opacity-50"
              >
                {joining ? t(locale, "invite.joining") : t(locale, "invite.join")}
              </button>
              {clerkEnabled() && (
                <Link
                  href={`/sign-in?redirect_url=/invite/${encodeURIComponent(code)}`}
                  className="rounded-md border border-[color:var(--bp-line)] px-5 py-3 text-sm text-ink-soft transition hover:border-river/40 hover:text-river"
                >
                  {t(locale, "nav.signIn")}
                </Link>
              )}
            </div>
            <p className="text-xs text-ink-soft/80">{t(locale, "invite.demoNote")}</p>
          </>
        )}
      </div>
    </section>
  );
}
