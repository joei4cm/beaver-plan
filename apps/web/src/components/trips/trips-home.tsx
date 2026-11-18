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
    const tplRes = await apiGet<{ templates: TemplateCard[] }>("/v1/templates");
    setTemplates(tplRes.templates);
    try {
      const tripRes = await apiGet<{ trips: Trip[] }>("/v1/trips");
      setTrips(tripRes.trips);
    } catch {
      // Demo shell without Neon: still show the curated sample trip.
      setTrips([
        {
          id: "sample-kyoto",
          title: "京都五日",
          destination: "Kyoto",
          startDate: "2026-04-10",
          endDate: "2026-04-14",
          timezone: "Asia/Tokyo",
          locale: "zh-CN",
          mapEngine: "auto",
          version: 1,
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ]);
    }
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
    <div className="relative mx-auto max-w-5xl px-6 pb-28 pt-6 md:px-10 md:pt-10">
      <div
        aria-hidden
        className="bp-topo pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 opacity-60"
      />

      <div className="animate-rise flex flex-wrap items-end justify-between gap-6 border-b border-[color:var(--bp-line)] pb-10">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
            Beaver Plan · 海狸旅行
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink md:text-6xl">
            {t(locale, "trips.title")}
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
            {t(locale, "trips.support")}
          </p>
        </div>
        <Link
          href="/trips/sample-kyoto"
          className="rounded-bp bg-river px-5 py-3 text-sm font-semibold text-foam transition duration-bp ease-bp hover:bg-river-deep"
        >
          {t(locale, "trips.openSample")}
        </Link>
      </div>

      {error && (
        <p className="mt-6 border-l-2 border-timber bg-timber/8 px-4 py-3 text-sm text-timber">
          {error}
        </p>
      )}

      <section className="mt-16">
        <header className="animate-rise mb-8 flex items-baseline justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              {t(locale, "trips.templates")}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-ink-soft">
              {t(locale, "trips.templatesSupport")}
            </p>
          </div>
        </header>

        <ul className="space-y-0">
          {templates.map((tpl, index) => {
            const title = tpl.title[locale] ?? tpl.title["zh-CN"];
            const desc = tpl.description[locale] ?? tpl.description["zh-CN"];
            const busy = creatingId === tpl.id;
            return (
              <li
                key={tpl.id}
                className="animate-rise group grid grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-[color:var(--bp-line)] py-7 last:border-b sm:gap-8"
                style={{ animationDelay: `${index * 55 + 40}ms` }}
              >
                <span className="font-display text-3xl font-bold tabular-nums text-mist md:text-4xl">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span
                      className={`hidden h-1.5 w-8 shrink-0 bg-gradient-to-r ${tpl.accent} sm:block`}
                      aria-hidden
                    />
                    <span className="font-display text-xl font-semibold text-ink transition group-hover:text-river md:text-2xl">
                      {title}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {desc}
                  </p>
                  <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-river/80">
                    {tpl.destination} · {tpl.dayCount}{" "}
                    {t(locale, "trips.dayUnit")} · {tpl.stopCount}{" "}
                    {t(locale, "trips.stopUnit")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || Boolean(creatingId)}
                  onClick={() => void createFromTemplate(tpl.id)}
                  className="shrink-0 rounded-bp border border-ink/15 bg-transparent px-4 py-2 text-sm font-semibold text-ink transition hover:border-river hover:bg-river hover:text-foam disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy
                    ? t(locale, "trips.creating")
                    : t(locale, "trips.useTemplate")}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-20">
        <header className="animate-rise mb-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            {t(locale, "trips.yours")}
          </h2>
        </header>

        {pending && trips.length === 0 ? (
          <p className="text-ink-soft">{t(locale, "trips.loading")}</p>
        ) : trips.length === 0 ? (
          <div className="animate-fade border border-dashed border-river/30 px-6 py-16 text-center">
            <p className="font-display text-2xl font-semibold text-ink md:text-3xl">
              {t(locale, "trips.empty")}
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm text-ink-soft">
              {t(locale, "trips.emptyCta")}
            </p>
          </div>
        ) : (
          <ul>
            {trips.map((trip, index) => {
              const isSample = trip.id === "sample-kyoto";
              const busy = dupBusyId === trip.id;
              const journalOn = Boolean(copyJournalIds[trip.id]);
              return (
                <li
                  key={trip.id}
                  className="animate-rise group border-t border-[color:var(--bp-line)] last:border-b"
                  style={{ animationDelay: `${index * 50 + 40}ms` }}
                >
                  <div className="flex flex-wrap items-center gap-4 py-6 sm:flex-nowrap sm:gap-6">
                    <Link
                      href={`/trips/${trip.id}`}
                      className="flex min-w-0 flex-1 items-baseline gap-4 transition duration-bp-fast ease-bp"
                    >
                      <span className="hidden font-display text-2xl font-bold tabular-nums text-mist sm:block">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <span className="font-display text-xl font-semibold text-ink transition group-hover:text-river md:text-2xl">
                          {trip.title}
                        </span>
                        <span className="mt-1 block text-sm text-ink-soft">
                          {trip.destination ?? "—"}
                          {isSample
                            ? ` · ${t(locale, "trips.sampleBadge")}`
                            : ""}
                        </span>
                      </div>
                    </Link>
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
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
                          className="accent-[color:var(--bp-river)]"
                        />
                        {t(locale, "trips.copyJournal")}
                      </label>
                      <button
                        type="button"
                        disabled={busy || Boolean(dupBusyId)}
                        onClick={() => void duplicateTrip(trip.id)}
                        className="rounded-bp border border-[color:var(--bp-line)] px-3 py-1.5 text-sm text-ink-soft transition duration-bp-fast ease-bp hover:border-river hover:text-river disabled:cursor-not-allowed disabled:opacity-40"
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
