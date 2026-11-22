"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
 * Invite SoftFail helper adoption (BEA-392 after #284 / depth #241) + craft
 * SoftFail query parity (BEA-420): `/invite/…?inviteSoftFail=1` forces SoftFail
 * depth under azure invite rail (mirrors Expo + #282 / wave 42). SoftFailBadge ·
 * SoftFailSupport · softFailMistWashClass · compact SoftFail mist band · tip-011
 * SheetPresence trip preview — never timber / Failed to fetch. No `/dev`
 * SoftFail gallery.
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
  /** Craft preview: /invite/…?inviteSoftFail=1 — SoftFail depth under invite. */
  const [inviteSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("inviteSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });

  /** Craft SoftFail: seed demo preview so SoftFail depth paints without a miss. */
  useEffect(() => {
    if (!inviteSoftPreview) return;
    setPreview((prev) => prev ?? demoPreview(code));
    setSoftNotice(t(locale, "invite.softOffline"));
    setError(null);
  }, [inviteSoftPreview, code, locale]);

  useEffect(() => {
    startTransition(() => {
      void apiGet<Preview>(`/v1/invites/${encodeURIComponent(code)}`)
        .then((data) => {
          setPreview(data);
          if (inviteSoftPreview) {
            setSoftNotice(t(locale, "invite.softOffline"));
          } else {
            setSoftNotice(null);
          }
          setError(null);
        })
        .catch((e: unknown) => {
          if (isPlannerNoiseError(e) || inviteSoftPreview) {
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
  }, [code, locale, inviteSoftPreview]);

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

  const sheetOpen =
    Boolean(preview) ||
    Boolean(softNotice) ||
    Boolean(error) ||
    inviteSoftPreview;
  /**
   * SoftFail owned by invite sheet + craft SoftFail query parity (BEA-420):
   * SoftFailBadge · SoftFailSupport · SoftFailNotice mist band · tip-011.
   * Craft: /invite/…?inviteSoftFail=1 — SoftFail depth without a transport miss.
   * SoftFail copy never timber / Failed to fetch.
   */
  const softFailCopy = t(locale, "invite.softOffline");
  const softCopy = inviteSoftPreview
    ? softFailCopy
    : (softNotice ??
      (error && isPlannerNoiseError(new Error(error)) ? softFailCopy : null));
  const softOpen = inviteSoftPreview || Boolean(softCopy);
  const hardError =
    error && !softOpen && !isPlannerNoiseError(new Error(error))
      ? error
      : null;

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-3xl flex-col justify-center px-6 py-16 md:px-10">
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute inset-0 -z-10 opacity-90"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 72% 55% at 12% 0%, rgba(47,107,255,0.16), transparent 58%),
            radial-gradient(ellipse 48% 38% at 90% 8%, rgba(96,165,250,0.14), transparent 52%),
            linear-gradient(180deg, #dbe8ff 0%, transparent 68%)
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

      {/*
        SoftFail helper adoption (BEA-392) + craft SoftFail query parity
        (BEA-420): SoftFailBadge · SoftFailSupport · softFailMistWashClass ·
        compact SoftFailNotice · tip-011 trip preview. Craft: ?inviteSoftFail=1 —
        never timber / Failed to fetch.
      */}
      <SheetPresence
        open={sheetOpen}
        className="mt-10 overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft"
        style={{ animationDelay: "100ms" }}
        aria-label={t(locale, "invite.sheetEyebrow")}
      >
        <header className="relative border-b border-[color:var(--bp-line)] bg-paper/70 px-5 py-3 shadow-[inset_3px_0_0_var(--bp-river)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                {t(locale, "invite.sheetEyebrow")}
              </span>
              {softOpen ? (
                <SoftFailSupport>
                  {t(locale, "invite.softSupport")}
                </SoftFailSupport>
              ) : (
                <span className="text-[11px] leading-snug text-ink-soft/80">
                  {t(locale, "invite.sheetSupport")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {softOpen ? (
                <SoftFailBadge>{t(locale, "invite.softBadge")}</SoftFailBadge>
              ) : (
                <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                  {t(locale, "invite.liveBadge")}
                </SoftFailLiveBadge>
              )}
              {preview ? (
                <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river-deep shadow-[inset_2px_0_0_var(--bp-river)]">
                  {t(locale, `collab.role.${preview.role}`)}
                </span>
              ) : null}
            </div>
          </div>
        </header>

        {/* Compact SoftFail under azure invite rail — never timber / Failed to fetch. */}
        <SoftFailNotice open={softOpen} compact>
          {softCopy ?? ""}
        </SoftFailNotice>

        <div className={`space-y-5 px-5 py-5 ${softFailMistWashClass}`}>
          {hardError ? (
            <p className="animate-rise text-sm text-ink-soft" role="alert">
              {hardError}
            </p>
          ) : null}

          {preview ? (
            <>
              <SheetPresence
                open
                className={`overflow-hidden rounded-bp-sm p-4 shadow-[inset_3px_0_0_var(--bp-river)] sm:p-5 ${
                  softOpen
                    ? "bg-gradient-to-br from-mist/55 via-mist/28 to-transparent"
                    : "bg-gradient-to-br from-mist/45 via-mist/20 to-transparent"
                }`}
                style={{ animationDelay: "40ms" }}
                aria-label={t(locale, "invite.previewEyebrow")}
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
                  {t(locale, "invite.previewEyebrow")}
                </p>
                <p
                  className="animate-rise mt-3 text-sm text-ink-soft"
                  style={{ animationDelay: "80ms" }}
                >
                  {preview.trip.destination ?? t(locale, "planner.trip")}
                </p>
                <p
                  className="animate-rise mt-1 font-display text-3xl tracking-tight text-ink"
                  style={{ animationDelay: "120ms" }}
                >
                  {preview.trip.title}
                </p>
                <p
                  className="animate-rise pt-2 text-sm text-ink-soft"
                  style={{ animationDelay: "160ms" }}
                >
                  {t(locale, "invite.asRole")}{" "}
                  <span className="font-semibold text-river">
                    {t(locale, `collab.role.${preview.role}`)}
                  </span>
                  {" · "}
                  <code className="rounded-bp-xs bg-river/10 px-1.5 py-0.5 font-mono tracking-wider text-river-deep shadow-[inset_2px_0_0_var(--bp-river)]">
                    {preview.code}
                  </code>
                </p>
              </SheetPresence>

              <div
                className="animate-rise flex flex-wrap items-center gap-3"
                style={{ animationDelay: "200ms" }}
              >
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
              <p
                className="animate-fade text-xs leading-relaxed text-ink-soft/80"
                style={{ animationDelay: "240ms" }}
              >
                {t(locale, "invite.demoNote")}
              </p>
            </>
          ) : null}
        </div>
      </SheetPresence>
    </section>
  );
}
