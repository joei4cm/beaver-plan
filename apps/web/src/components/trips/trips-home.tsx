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

function tripBadge(trip: Trip): "sample" | "local" | null {
  if (trip.id === "sample-kyoto") return "sample";
  if (getLocalTrip(trip.id)) return "local";
  return null;
}

/** Destination · dates only — badge chips carry sample/local. */
function formatTripMeta(trip: Trip): string {
  const parts: string[] = [];
  if (trip.destination) parts.push(trip.destination);
  if (trip.startDate) {
    const range =
      trip.endDate && trip.endDate !== trip.startDate
        ? `${trip.startDate} → ${trip.endDate}`
        : trip.startDate;
    parts.push(range);
  }
  return parts.join(" · ") || "—";
}

/** Playbooks editorial index. */
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

/** Trips list density — quieter mark, title leads hierarchy. */
function DenseIndexMark({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="w-8 shrink-0 self-start pt-0.5 font-display text-xl font-bold tabular-nums leading-none text-mist md:w-10 md:text-2xl"
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

/** Tip 015 — shared title node for trips → planner continuity. */
function TripTitle({ tripId, title }: { tripId: string; title: string }) {
  return (
    <span
      className="bp-vt-trip-title font-display text-lg font-semibold tracking-tight text-ink transition duration-bp-fast ease-bp-out group-hover:text-river md:text-xl"
      style={{ viewTransitionName: `bp-trip-${tripId}` }}
    >
      {title}
    </span>
  );
}

function TripBadgeChip({
  kind,
  locale,
}: {
  kind: "sample" | "local";
  locale: Locale;
}) {
  return (
    <span
      className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        kind === "sample"
          ? "bg-river/10 text-river"
          : "bg-mist text-ink-soft"
      }`}
    >
      {kind === "sample"
        ? t(locale, "trips.sampleBadge")
        : t(locale, "trips.localBadge")}
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
  const [templatesSoft, setTemplatesSoft] = useState(false);
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
      if (tplRes.templates?.length) {
        setTemplates(tplRes.templates);
        setTemplatesSoft(false);
      } else {
        // Empty remote catalog → seed + soft notice (never leave the section blank).
        setTemplates(templateCardsFromSeed());
        setTemplatesSoft(true);
      }
    } catch {
      setTemplates(templateCardsFromSeed());
      setTemplatesSoft(true);
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
  const showTemplatesEmpty = hydrated && templates.length === 0;
  const loading = pending && !hydrated;
  const listSoft = Boolean(softNotice);

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
            className="rounded-bp bg-river px-5 py-3 text-sm font-semibold text-foam bp-transition hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            {t(locale, "trips.new")}
          </Link>
          <Link
            href="/trips/sample-kyoto"
            className="rounded-bp border border-river/35 px-5 py-3 text-sm font-semibold text-river bp-transition hover:border-river hover:bg-river hover:text-foam focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
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

      <section className="mt-16" aria-labelledby="trips-yours-heading">
        <header className="animate-rise mb-6">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
            {t(locale, "trips.yoursEyebrow")}
          </p>
          <h2
            id="trips-yours-heading"
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl"
          >
            {showEmptyInvite && !loading
              ? t(locale, "trips.empty")
              : t(locale, "trips.yours")}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            {showEmptyInvite && !loading
              ? t(locale, "trips.emptyCta")
              : t(locale, "trips.yoursSupport")}
          </p>
        </header>

        {/* Loading: SoftFailNotice above list skeleton. Empty seed: notice lives in sheet. */}
        {loading ? (
          <SoftFailNotice
            open={!error && Boolean(softNotice)}
            className="mb-6"
          >
            {softNotice ?? ""}
          </SoftFailNotice>
        ) : null}

        {loading ? (
          <TripsListSkeleton />
        ) : showEmptyInvite ? (
          <div className="animate-fade overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft">
            {/* Seed CTA chrome — azure rail · SoftFailNotice · primary/secondary hierarchy */}
            <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                  {t(locale, "trips.seedRail")}
                </span>
                <span className="text-[11px] leading-snug text-ink-soft/80">
                  {t(locale, "trips.seedSupport")}
                </span>
              </div>
              <span
                className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
                  listSoft
                    ? "bg-mist text-ink-soft"
                    : "bg-river/12 text-river"
                }`}
              >
                {listSoft
                  ? t(locale, "trips.seedDemo")
                  : t(locale, "trips.seedReady")}
              </span>
            </header>

            <SoftFailNotice
              open={!error && Boolean(softNotice)}
              compact
            >
              {softNotice ?? ""}
            </SoftFailNotice>

            <div
              role="group"
              aria-label={t(locale, "trips.seedActions")}
              className="flex flex-wrap items-center gap-2.5 px-4 py-4 sm:px-5"
            >
              <Link
                href="/trips/new"
                className="rounded-bp bg-river px-5 py-3 text-sm font-semibold tracking-wide text-foam shadow-bp-soft bp-transition hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
              >
                {t(locale, "trips.new")}
              </Link>
              <Link
                href="/trips/sample-kyoto"
                className="rounded-bp border border-river/35 px-4 py-2.5 text-sm font-semibold text-river bp-transition hover:border-river hover:bg-river hover:text-foam focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
              >
                {t(locale, "trips.openSample")}
              </Link>
              <a
                href="#trips-templates-heading"
                className="rounded-bp-xs px-2.5 py-2 text-sm font-medium text-ink-soft underline-offset-4 bp-transition hover:text-river hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
              >
                {t(locale, "trips.seedPlaybooks")}
              </a>
            </div>

            {sampleTrips.length > 0 ? (
              <div className="border-t border-[color:var(--bp-line)]">
                <p className="px-4 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river/80 sm:px-5">
                  {t(locale, "trips.sampleEyebrow")}
                </p>
                <ul role="list" aria-label={t(locale, "trips.sampleEyebrow")}>
                  {sampleTrips.map((trip, index) => {
                    const badge = tripBadge(trip);
                    return (
                      <li
                        key={trip.id}
                        className="animate-rise group border-t border-[color:var(--bp-line)] first:border-t-0"
                        style={{ animationDelay: `${index * 50 + 40}ms` }}
                      >
                        <Link
                          href={`/trips/${trip.id}`}
                          className="flex items-start gap-3 px-4 py-4 bp-transition hover:bg-mist/25 sm:gap-5 sm:px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-inset"
                        >
                          <DenseIndexMark n={index + 1} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <TripTitle tripId={trip.id} title={trip.title} />
                              {badge ? (
                                <TripBadgeChip kind={badge} locale={locale} />
                              ) : null}
                            </div>
                            <span className="mt-0.5 block text-xs leading-snug text-ink-soft/90">
                              {formatTripMeta(trip)}
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="animate-fade overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft">
            {/* Trips list chrome — azure rail · count · SoftFailNotice · #46 density */}
            <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                  {t(locale, "trips.listRail")}
                </span>
                <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                  {t(locale, "trips.listCount").replace(
                    "{n}",
                    String(trips.length),
                  )}
                </span>
              </div>
              <span
                className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
                  listSoft
                    ? "bg-mist text-ink-soft"
                    : "bg-river/12 text-river"
                }`}
              >
                {listSoft
                  ? t(locale, "trips.listDemo")
                  : t(locale, "trips.listLive")}
              </span>
            </header>

            <SoftFailNotice
              open={!error && Boolean(softNotice)}
              compact
            >
              {softNotice ?? ""}
            </SoftFailNotice>

            <ul role="list" aria-label={t(locale, "trips.yours")}>
              {trips.map((trip, index) => {
                const busy = dupBusyId === trip.id;
                const journalOn = Boolean(copyJournalIds[trip.id]);
                const badge = tripBadge(trip);
                return (
                  <li
                    key={trip.id}
                    className="animate-rise group border-t border-[color:var(--bp-line)] first:border-t-0 bp-transition hover:bg-mist/25"
                    style={{ animationDelay: `${index * 50 + 40}ms` }}
                  >
                    <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:gap-5 sm:px-5 sm:py-[1.125rem]">
                      <Link
                        href={`/trips/${trip.id}`}
                        className="flex min-w-0 flex-1 items-start gap-3 bp-transition sm:gap-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
                      >
                        <DenseIndexMark n={index + 1} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <TripTitle tripId={trip.id} title={trip.title} />
                            {badge ? (
                              <TripBadgeChip kind={badge} locale={locale} />
                            ) : null}
                          </div>
                          <span className="mt-0.5 block text-xs leading-snug text-ink-soft/90">
                            {formatTripMeta(trip)}
                          </span>
                        </div>
                      </Link>
                      <div className="ml-auto flex shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-1.5 sm:ml-0 sm:flex-col sm:items-end sm:gap-1.5">
                        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-soft/80">
                          <input
                            type="checkbox"
                            checked={journalOn}
                            onChange={(e) =>
                              setCopyJournalIds((prev) => ({
                                ...prev,
                                [trip.id]: e.target.checked,
                              }))
                            }
                            className="size-3.5 accent-[color:var(--bp-river)]"
                          />
                          {t(locale, "trips.copyJournal")}
                        </label>
                        <button
                          type="button"
                          disabled={busy || Boolean(dupBusyId)}
                          onClick={() => void duplicateTrip(trip.id)}
                          className="rounded-bp-xs border border-river/30 px-2.5 py-1 text-xs font-semibold text-river bp-transition hover:border-river hover:bg-river hover:text-foam disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
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
          </div>
        )}
      </section>

      <section className="mt-20" aria-labelledby="trips-templates-heading">
        <header className="animate-rise mb-6">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
            {t(locale, "trips.templatesEyebrow")}
          </p>
          <h2
            id="trips-templates-heading"
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl"
          >
            {showTemplatesEmpty && !loading
              ? t(locale, "trips.templatesEmpty")
              : t(locale, "trips.templates")}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            {showTemplatesEmpty && !loading
              ? t(locale, "trips.templatesEmptyCta")
              : t(locale, "trips.templatesSupport")}
          </p>
        </header>

        {loading ? (
          <TemplatesListSkeleton />
        ) : showTemplatesEmpty ? (
          <div className="animate-fade">
            <SoftFailNotice open={templatesSoft} className="mb-6">
              {t(locale, "trips.templatesSoftOffline")}
            </SoftFailNotice>
            <Link
              href="/trips/new"
              className="inline-flex rounded-bp bg-river px-5 py-3 text-sm font-semibold text-foam bp-transition hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {t(locale, "trips.new")}
            </Link>
          </div>
        ) : (
          <div className="animate-fade overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft">
            {/* Playbooks chrome — azure rail · count · SoftFailNotice · #46 */}
            <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                  {t(locale, "trips.templatesRail")}
                </span>
                <span className="text-[11px] font-medium tabular-nums text-ink-soft/80">
                  {t(locale, "trips.templatesCount").replace(
                    "{n}",
                    String(templates.length),
                  )}
                </span>
              </div>
              <span
                className={`rounded-bp-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition duration-bp-fast ease-bp-out ${
                  templatesSoft
                    ? "bg-mist text-ink-soft"
                    : "bg-river/12 text-river"
                }`}
              >
                {templatesSoft
                  ? t(locale, "trips.templatesSeeded")
                  : t(locale, "trips.templatesCatalog")}
              </span>
            </header>

            <SoftFailNotice open={templatesSoft} compact>
              {t(locale, "trips.templatesSoftOffline")}
            </SoftFailNotice>

            <ul
              className="space-y-0"
              role="list"
              aria-label={t(locale, "trips.templates")}
            >
              {templates.map((tpl, index) => {
                const title = tpl.title[locale] ?? tpl.title["zh-CN"];
                const desc =
                  tpl.description[locale] ?? tpl.description["zh-CN"];
                const busy = creatingId === tpl.id;
                return (
                  <li
                    key={tpl.id}
                    className="animate-rise group grid grid-cols-[auto_1fr] items-center gap-4 border-t border-[color:var(--bp-line)] px-4 py-6 bp-transition first:border-t-0 hover:bg-mist/25 sm:grid-cols-[auto_1fr_auto] sm:gap-8 sm:px-5 sm:py-7"
                    style={{ animationDelay: `${index * 55 + 40}ms` }}
                  >
                    <IndexMark n={index + 1} />
                    <div className="min-w-0">
                      <span className="font-display text-xl font-semibold tracking-tight text-ink transition duration-bp-fast ease-bp-out group-hover:text-river md:text-2xl">
                        {title}
                      </span>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                        {desc}
                      </p>
                      <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-river/80">
                        {tpl.destination} · {tpl.dayCount}{" "}
                        {t(locale, "trips.dayUnit")} · {tpl.stopCount}{" "}
                        {t(locale, "trips.stopUnit")}
                      </p>
                    </div>
                    <div
                      className="col-span-2 flex shrink-0 flex-col gap-2 sm:col-span-1 sm:flex-row sm:items-center"
                      role="group"
                      aria-label={title}
                    >
                      <button
                        type="button"
                        disabled={busy || Boolean(creatingId)}
                        onClick={() => void createFromTemplate(tpl.id)}
                        className="rounded-bp bg-river px-4 py-2.5 text-sm font-semibold text-foam bp-transition hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
                      >
                        {busy
                          ? t(locale, "trips.creating")
                          : t(locale, "trips.useTemplate")}
                      </button>
                      <Link
                        href={`/trips/new?template=${tpl.id}`}
                        className="rounded-bp border border-river/35 px-3 py-2.5 text-center text-sm font-semibold text-river bp-transition hover:border-river hover:bg-river hover:text-foam focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
                      >
                        {t(locale, "trips.customize")}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
