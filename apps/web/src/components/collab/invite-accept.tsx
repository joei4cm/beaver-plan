"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
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

/**
 * Lumen invite accept sheet — azure header · SoftFailNotice · Join CTA,
 * SheetPresence (#69) + tip-011 settle (#46). Soft-fail never timber.
 */
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

  const sheetOpen = Boolean(preview) || Boolean(softNotice) || Boolean(error);
  const hardError =
    error && !softNotice && !isPlannerNoiseError(new Error(error))
      ? error
      : null;
  const softCopy =
    softNotice ??
    (error && isPlannerNoiseError(new Error(error))
      ? t(locale, "invite.softOffline")
      : null);

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

      {pending && !preview && !error && !softNotice ? (
        <p className="animate-fade mt-10 text-ink-soft">
          {t(locale, "invite.loading")}
        </p>
      ) : null}

      <SheetPresence
        open={sheetOpen}
        className="mt-10 overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-bp"
        style={{ animationDelay: "120ms" }}
        aria-label={t(locale, "invite.title")}
      >
        {/* Azure hierarchy — eyebrow · title · soft/role badge · SoftFailNotice */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-5 py-3 shadow-[inset_3px_0_0_var(--bp-river)]">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
              {t(locale, "invite.sheetEyebrow")}
            </span>
            <span className="text-[11px] font-medium text-ink-soft/80">
              {t(locale, "invite.title")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {softCopy ? (
              <span className="rounded-bp-xs bg-mist px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft transition duration-bp-fast ease-bp-out">
                {t(locale, "invite.softBadge")}
              </span>
            ) : null}
            {preview ? (
              <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river-deep">
                {t(locale, `collab.role.${preview.role}`)}
              </span>
            ) : null}
          </div>
        </div>

        <SoftFailNotice open={Boolean(softCopy)} compact>
          {softCopy ?? ""}
        </SoftFailNotice>

        <div className="space-y-5 px-5 py-5">
          {hardError ? (
            <p className="text-sm text-timber" role="alert">
              {hardError}
            </p>
          ) : null}

          {preview ? (
            <>
              <div className="space-y-1.5">
                <p className="text-sm text-ink-soft">
                  {preview.trip.destination ?? t(locale, "planner.trip")}
                </p>
                <p className="font-display text-3xl tracking-tight text-ink">
                  {preview.trip.title}
                </p>
                <p className="pt-1 text-sm text-ink-soft">
                  {t(locale, "invite.asRole")}{" "}
                  <span className="font-semibold text-river">
                    {t(locale, `collab.role.${preview.role}`)}
                  </span>
                  {" · "}
                  <code className="rounded-bp-xs bg-river/10 px-1.5 py-0.5 font-mono tracking-wider text-river-deep">
                    {preview.code}
                  </code>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={joining}
                  onClick={() => void accept()}
                  className="rounded-bp bg-river px-5 py-3 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam disabled:opacity-50"
                >
                  {joining
                    ? t(locale, "invite.joining")
                    : t(locale, "invite.join")}
                </button>
                {clerkEnabled() && (
                  <Link
                    href={`/sign-in?redirect_url=/invite/${encodeURIComponent(code)}`}
                    className="rounded-bp border border-[color:var(--bp-line)] px-5 py-3 text-sm text-ink-soft transition duration-bp-fast ease-bp-out hover:border-river/40 hover:text-river focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
                  >
                    {t(locale, "nav.signIn")}
                  </Link>
                )}
              </div>
              <p className="text-xs leading-relaxed text-ink-soft/80">
                {t(locale, "invite.demoNote")}
              </p>
            </>
          ) : null}
        </div>
      </SheetPresence>
    </section>
  );
}
