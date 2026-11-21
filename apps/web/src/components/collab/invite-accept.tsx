"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
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

function demoPreview(code: string): Preview {
  return {
    code: code || "BP-DEMO42",
    role: "editor",
    trip: {
      id: "sample-kyoto",
      title: "Kyoto · sample",
      destination: "Kyoto",
    },
  };
}

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
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [pending, startTransition] = useTransition();
  const brandName = locale === "zh-CN" ? brand.zh : brand.en;

  useEffect(() => {
    startTransition(() => {
      void apiGet<Preview>(`/v1/invites/${encodeURIComponent(code)}`)
        .then((data) => {
          setPreview(data);
          setSoftNotice(null);
          setError(null);
        })
        .catch((e: unknown) => {
          if (isPlannerNoiseError(e)) {
            setPreview(demoPreview(code));
            setSoftNotice(t(locale, "invite.softOffline"));
            setError(null);
            return;
          }
          setPreview(null);
          setSoftNotice(null);
          setError(e instanceof Error ? e.message : "load_failed");
        });
    });
  }, [code, locale]);

  async function accept() {
    setJoining(true);
    setError(null);
    try {
      if (softNotice) {
        router.push(`/trips/${preview?.trip.id ?? "sample-kyoto"}`);
        return;
      }
      const res = await apiSend<{
        trip: { id: string };
        alreadyMember?: boolean;
      }>(`/v1/invites/${encodeURIComponent(code)}/accept`, "POST", {});
      router.push(`/trips/${res.trip.id}`);
    } catch (e) {
      if (isPlannerNoiseError(e)) {
        setSoftNotice(t(locale, "invite.softOffline"));
        router.push(`/trips/${preview?.trip.id ?? "sample-kyoto"}`);
        return;
      }
      setError(e instanceof Error ? e.message : "join_failed");
      setJoining(false);
    }
  }

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-3xl flex-col justify-center px-6 py-16 md:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 55% at 12% 0%, rgba(47,107,255,0.14), transparent 58%),
            radial-gradient(ellipse 50% 40% at 88% 8%, rgba(96,165,250,0.12), transparent 52%),
            linear-gradient(180deg, #dbe8ff 0%, transparent 70%)
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
        {pending && !preview && !error && !softNotice && (
          <p className="text-ink-soft">{t(locale, "invite.loading")}</p>
        )}
        {softNotice ? <SoftFailNotice>{softNotice}</SoftFailNotice> : null}
        {error && !softNotice ? (
          <p className="text-sm text-timber" role="alert">
            {error}
          </p>
        ) : null}
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
                className="rounded-bp bg-river px-5 py-3 text-sm font-medium text-foam transition hover:bg-river-deep disabled:opacity-50"
              >
                {joining ? t(locale, "invite.joining") : t(locale, "invite.join")}
              </button>
              {clerkEnabled() && (
                <Link
                  href={`/sign-in?redirect_url=/invite/${encodeURIComponent(code)}`}
                  className="rounded-bp border border-[color:var(--bp-line)] px-5 py-3 text-sm text-ink-soft transition hover:border-river/40 hover:text-river"
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
