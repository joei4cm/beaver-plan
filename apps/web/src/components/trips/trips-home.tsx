"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Trip } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { apiGet, apiSend } from "@/lib/api";

type TemplateCard = {
  id: string;
  title: { "zh-CN": string; en: string };
  destination: string;
  description: { "zh-CN": string; en: string };
  accent: string;
  dayCount: number;
  stopCount: number;
};

type Props = {
  locale: Locale;
};

export function TripsHome({ locale }: Props) {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [dupBusyId, setDupBusyId] = useState<string | null>(null);
  const [copyJournalIds, setCopyJournalIds] = useState<Record<string, boolean>>(
    {},
  );

  const load = useCallback(async () => {
    const [tripRes, tplRes] = await Promise.all([
      apiGet<{ trips: Trip[] }>("/v1/trips"),
      apiGet<{ templates: TemplateCard[] }>("/v1/templates"),
    ]);
    setTrips(tripRes.trips);
    setTemplates(tplRes.templates);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load().catch((e: Error) => setError(e.message));
    });
  }, [load]);

  async function createFromTemplate(id: string) {
    setCreatingId(id);
    setError(null);
    try {
      const res = await apiSend<{ trip: Trip }>(
        `/v1/templates/${id}/create`,
        "POST",
        {},
      );
      router.push(`/trips/${res.trip.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "create_failed");
      setCreatingId(null);
    }
  }

  async function duplicateTrip(id: string) {
    setDupBusyId(id);
    setError(null);
    try {
      const res = await apiSend<{ trip: Trip }>(
        `/v1/trips/${id}/duplicate`,
        "POST",
        { copyJournal: Boolean(copyJournalIds[id]) },
      );
      await load();
      router.push(`/trips/${res.trip.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "duplicate_failed");
      setDupBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-8 md:px-10">
      <div className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-river/75">
            Beaver Plan · 海狸旅行
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-ink md:text-5xl">
            {t(locale, "trips.title")}
          </h1>
          <p className="mt-3 max-w-lg text-ink-soft">
            {t(locale, "trips.support")}
          </p>
        </div>
        <Link
          href="/trips/sample-kyoto"
          className="rounded-bp bg-river px-4 py-2.5 text-sm text-foam shadow-bp-soft transition duration-bp ease-bp hover:bg-river-deep"
        >
          {t(locale, "trips.openSample")}
        </Link>
      </div>

      {error && (
        <p className="mt-6 rounded-md border border-timber/30 bg-timber/10 px-4 py-3 text-sm text-timber">
          {error}
        </p>
      )}

      <section className="mt-14">
        <header className="animate-rise mb-6">
          <h2 className="font-display text-2xl tracking-tight text-ink md:text-3xl">
            {t(locale, "trips.templates")}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            {t(locale, "trips.templatesSupport")}
          </p>
        </header>

        <ul className="space-y-0 divide-y divide-[color:var(--bp-line)] border-y border-[color:var(--bp-line)]">
          {templates.map((tpl, index) => {
            const title = tpl.title[locale] ?? tpl.title["zh-CN"];
            const desc = tpl.description[locale] ?? tpl.description["zh-CN"];
            const busy = creatingId === tpl.id;
            return (
              <li
                key={tpl.id}
                className="animate-rise group flex flex-wrap items-stretch gap-0 sm:flex-nowrap"
                style={{ animationDelay: `${index * 60 + 40}ms` }}
              >
                <div
                  className={`hidden w-28 shrink-0 bg-gradient-to-br ${tpl.accent} sm:block`}
                  aria-hidden
                />
                <div className="flex flex-1 flex-col gap-1 px-1 py-6 sm:px-6">
                  <span className="font-display text-2xl text-ink">{title}</span>
                  <span className="text-sm text-ink-soft/90">{desc}</span>
                  <span className="mt-1 text-xs uppercase tracking-[0.14em] text-river/70">
                    {tpl.destination} · {tpl.dayCount} {t(locale, "trips.dayUnit")} ·{" "}
                    {tpl.stopCount} {t(locale, "trips.stopUnit")}
                  </span>
                </div>
                <div className="flex items-center px-1 pb-5 sm:px-4 sm:pb-0">
                  <button
                    type="button"
                    disabled={busy || Boolean(creatingId)}
                    onClick={() => void createFromTemplate(tpl.id)}
                    className="rounded-md bg-timber px-4 py-2 text-sm text-foam transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy
                      ? t(locale, "trips.creating")
                      : t(locale, "trips.useTemplate")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-16">
        <header className="animate-rise mb-6">
          <h2 className="font-display text-2xl tracking-tight text-ink md:text-3xl">
            {t(locale, "trips.yours")}
          </h2>
        </header>

        {pending && trips.length === 0 ? (
          <p className="text-ink-soft">{t(locale, "trips.loading")}</p>
        ) : trips.length === 0 ? (
          <div className="animate-fade rounded-bp-lg border border-dashed border-river/30 bg-foam/40 px-6 py-12 text-center">
            <p className="font-display text-2xl text-ink md:text-3xl">
              {t(locale, "trips.empty")}
            </p>
            <p className="mt-3 text-sm text-ink-soft">
              {t(locale, "trips.emptyCta")}
            </p>
          </div>
        ) : (
          <ul className="space-y-0 divide-y divide-[color:var(--bp-line)] border-y border-[color:var(--bp-line)]">
            {trips.map((trip, index) => {
              const isSample = trip.id === "sample-kyoto";
              const busy = dupBusyId === trip.id;
              const journalOn = Boolean(copyJournalIds[trip.id]);
              return (
                <li
                  key={trip.id}
                  className="animate-rise group"
                  style={{ animationDelay: `${index * 50 + 40}ms` }}
                >
                  <div className="flex flex-wrap items-stretch gap-0 sm:flex-nowrap">
                    <Link
                      href={`/trips/${trip.id}`}
                      className="flex min-w-0 flex-1 items-stretch transition duration-bp-fast ease-bp hover:bg-foam/40"
                    >
                      <div
                        className="hidden w-28 shrink-0 bg-gradient-to-br from-river/25 to-mist/35 sm:block"
                        aria-hidden
                      />
                      <div className="flex flex-1 flex-col gap-1 px-1 py-6 sm:px-6">
                        <span className="font-display text-2xl text-ink transition group-hover:text-river">
                          {trip.title}
                        </span>
                        <span className="text-sm text-ink-soft/80">
                          {trip.destination ?? "—"}
                          {isSample
                            ? ` · ${t(locale, "trips.sampleBadge")}`
                            : ""}
                        </span>
                      </div>
                    </Link>
                    <div className="flex flex-col items-stretch justify-center gap-2 px-1 pb-5 sm:items-end sm:px-4 sm:pb-0">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
                        <input
                          type="checkbox"
                          checked={journalOn}
                          onChange={(e) =>
                            setCopyJournalIds((prev) => ({
                              ...prev,
                              [trip.id]: e.target.checked,
                            }))
                          }
                          className="accent-[color:var(--bp-river,#1a6557)]"
                        />
                        {t(locale, "trips.copyJournal")}
                      </label>
                      <button
                        type="button"
                        disabled={busy || Boolean(dupBusyId)}
                        onClick={() => void duplicateTrip(trip.id)}
                        className="rounded-bp border border-[color:var(--bp-line)] bg-foam/70 px-3 py-1.5 text-sm text-ink-soft transition duration-bp-fast ease-bp hover:border-river/40 hover:text-river disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy
                          ? t(locale, "trips.duplicating")
                          : t(locale, "trips.duplicate")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
