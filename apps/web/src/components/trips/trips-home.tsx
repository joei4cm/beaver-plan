"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Trip } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
import {
  getLocalTrip,
  materializeTemplateLocal,
  mergeTripLists,
  templateCardsFromSeed,
  type TemplateCard,
} from "@/lib/local-trips";
import {
  TemplatesListSkeleton,
  TripsListSkeleton,
} from "@/components/ui/skeleton";

type Props = {
  locale: Locale;
};

function formatTripMeta(trip: Trip, locale: Locale): string {
  const parts: string[] = [];
  if (trip.destination) parts.push(trip.destination);
  if (trip.startDate) {
    const range =
      trip.endDate && trip.endDate !== trip.startDate
        ? `${trip.startDate} → ${trip.endDate}`
        : trip.startDate;
    parts.push(range);
  }
  if (trip.id === "sample-kyoto") {
    parts.push(t(locale, "trips.sampleBadge"));
  } else if (getLocalTrip(trip.id)) {
    parts.push(t(locale, "trips.localBadge"));
  }
  return parts.join(" · ") || "—";
}

function IndexMark({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="w-10 shrink-0 font-display text-2xl font-bold tabular-nums leading-none text-mist md:w-12 md:text-3xl"
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

/** Tip 015 — shared title node for trips → planner continuity. */
function TripTitle({ tripId, title }: { tripId: string; title: string }) {
  return (
    <span
      className="bp-vt-trip-title font-display text-xl font-semibold text-ink transition duration-bp-fast ease-bp-out group-hover:text-river md:text-2xl"
      style={{ viewTransitionName: `bp-trip-${tripId}` }}
    >
      {title}
    </span>
  );
}

export function TripsHome({ locale }: Props) {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [templates, setTemplates] = useState<TemplateCard[]>(() =>
    templateCardsFromSeed(),
  );
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [dupBusyId, setDupBusyId] = useState<string | null>(null);
  const [copyJournalIds, setCopyJournalIds] = useState<Record<string, boolean>>(
    {},
  );
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    let remoteTrips: Trip[] | null = null;
    let remoteFailed = false;

    try {
      const tplRes = await apiGet<{ templates: TemplateCard[] }>("/v1/templates");
      if (tplRes.templates?.length) setTemplates(tplRes.templates);
    } catch {
      setTemplates(templateCardsFromSeed());
    }

    try {
      const tripRes = await apiGet<{ trips: Trip[] }>("/v1/trips");
      remoteTrips = tripRes.trips;
    } catch (e) {
      remoteFailed = true;
      if (!isPlannerNoiseError(e)) {
        setError(e instanceof Error ? e.message : "load_failed");
      }
    }

    const merged = mergeTripLists(remoteTrips ?? [], {
      includeSampleFallback: remoteFailed || !remoteTrips?.length,
    });
    setTrips(merged);
    if (remoteFailed) {
      setSoftNotice(t(locale, "trips.softOffline"));
      setError(null);
    } else {
      setSoftNotice(null);
    }
    setHydrated(true);
  }, [locale]);

  useEffect(() => {
    startTransition(() => {
      void load();
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
      if (isPlannerNoiseError(e)) {
        const local = materializeTemplateLocal(id);
        if (local) {
          setSoftNotice(t(locale, "trips.create.demoLocal"));
          router.push(`/trips/${local.trip.id}`);
          return;
        }
      }
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
      if (isPlannerNoiseError(e)) {
        setSoftNotice(t(locale, "trips.softOffline"));
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "duplicate_failed");
      }
      setDupBusyId(null);
    }
  }

  const ownTrips = trips.filter((x) => x.id !== "sample-kyoto");
  const sampleTrips = trips.filter((x) => x.id === "sample-kyoto");
  const showEmptyInvite = hydrated && ownTrips.length === 0;
  const loading = pending && !hydrated;

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
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/trips/new"
            className="rounded-bp bg-river px-5 py-3 text-sm font-semibold text-foam transition duration-bp ease-bp-out hover:bg-river-deep"
          >
            {t(locale, "trips.new")}
          </Link>
          <Link
            href="/trips/sample-kyoto"
            className="rounded-bp border border-river/35 px-5 py-3 text-sm font-semibold text-river transition duration-bp-fast ease-bp-out hover:border-river hover:bg-river hover:text-foam"
          >
            {t(locale, "trips.openSample")}
          </Link>
        </div>
      </div>

      {error ? (
        <p
          className="mt-6 rounded-bp-sm border border-timber/25 bg-timber/8 px-4 py-3 text-sm text-timber"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {!error && softNotice ? (
        <SoftFailNotice className="mt-6">{softNotice}</SoftFailNotice>
      ) : null}

      <section className="mt-16" aria-labelledby="trips-yours-heading">
        <header className="animate-rise mb-8">
          <h2
            id="trips-yours-heading"
            className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl"
          >
            {t(locale, "trips.yours")}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            {t(locale, "trips.yoursSupport")}
          </p>
        </header>

        {loading ? (
          <TripsListSkeleton />
        ) : showEmptyInvite ? (
          <div className="animate-fade">
            <div className="max-w-lg">
              <p className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                {t(locale, "trips.empty")}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                {t(locale, "trips.emptyCta")}
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/trips/new"
                  className="rounded-bp bg-river px-5 py-3 text-sm font-semibold text-foam transition duration-bp ease-bp-out hover:bg-river-deep"
                >
                  {t(locale, "trips.new")}
                </Link>
                <Link
                  href="/trips/sample-kyoto"
                  className="text-sm font-semibold text-river transition duration-bp-fast ease-bp-out hover:text-river-deep"
                >
                  {t(locale, "trips.openSample")} →
                </Link>
              </div>
            </div>

            {sampleTrips.length > 0 && (
              <ul className="mt-12">
                {sampleTrips.map((trip, index) => (
                  <li
                    key={trip.id}
                    className="animate-rise group border-t border-[color:var(--bp-line)] last:border-b"
                    style={{ animationDelay: `${index * 50 + 40}ms` }}
                  >
                    <Link
                      href={`/trips/${trip.id}`}
                      className="flex items-baseline gap-4 py-6 transition duration-bp-fast ease-bp-out sm:gap-6"
                    >
                      <IndexMark n={index + 1} />
                      <div className="min-w-0">
                        <TripTitle tripId={trip.id} title={trip.title} />
                        <span className="mt-1 block text-sm text-ink-soft">
                          {formatTripMeta(trip, locale)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <ul>
            {trips.map((trip, index) => {
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
                      className="flex min-w-0 flex-1 items-baseline gap-4 transition duration-bp-fast ease-bp-out sm:gap-6"
                    >
                      <IndexMark n={index + 1} />
                      <div className="min-w-0">
                        <TripTitle tripId={trip.id} title={trip.title} />
                        <span className="mt-1 block text-sm text-ink-soft">
                          {formatTripMeta(trip, locale)}
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
                        className="rounded-bp border border-river/40 px-3 py-1.5 text-sm font-semibold text-river transition duration-bp-fast ease-bp-out hover:border-river hover:bg-river hover:text-foam disabled:cursor-not-allowed disabled:opacity-40"
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

      <section className="mt-20" aria-labelledby="trips-templates-heading">
        <header className="animate-rise mb-8">
          <h2
            id="trips-templates-heading"
            className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl"
          >
            {t(locale, "trips.templates")}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            {t(locale, "trips.templatesSupport")}
          </p>
        </header>

        {loading ? (
          <TemplatesListSkeleton />
        ) : (
          <ul className="space-y-0">
            {templates.map((tpl, index) => {
              const title = tpl.title[locale] ?? tpl.title["zh-CN"];
              const desc = tpl.description[locale] ?? tpl.description["zh-CN"];
              const busy = creatingId === tpl.id;
              return (
                <li
                  key={tpl.id}
                  className="animate-rise group grid grid-cols-[auto_1fr] items-center gap-4 border-t border-[color:var(--bp-line)] py-7 last:border-b sm:grid-cols-[auto_1fr_auto] sm:gap-8"
                  style={{ animationDelay: `${index * 55 + 40}ms` }}
                >
                  <IndexMark n={index + 1} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span
                        className={`hidden h-1.5 w-8 shrink-0 bg-gradient-to-r ${tpl.accent} sm:block`}
                        aria-hidden
                      />
                      <span className="font-display text-xl font-semibold text-ink transition duration-bp-fast ease-bp-out group-hover:text-river md:text-2xl">
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
                  <div className="col-span-2 flex shrink-0 flex-col gap-2 sm:col-span-1 sm:flex-row">
                    <Link
                      href={`/trips/new?template=${tpl.id}`}
                      className="rounded-bp border border-ink/12 px-3 py-2 text-center text-sm font-semibold text-ink-soft transition duration-bp-fast ease-bp-out hover:border-river hover:text-river"
                    >
                      {t(locale, "trips.customize")}
                    </Link>
                    <button
                      type="button"
                      disabled={busy || Boolean(creatingId)}
                      onClick={() => void createFromTemplate(tpl.id)}
                      className="rounded-bp bg-river px-4 py-2 text-sm font-semibold text-foam transition duration-bp ease-bp-out hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
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
        )}
      </section>
    </div>
  );
}
