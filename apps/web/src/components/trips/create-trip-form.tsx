"use client";

import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Trip } from "@beaver/core";
import { todayIsoDate } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
import {
  createBlankLocalTrip,
  templateCardsFromSeed,
  type TemplateCard,
} from "@/lib/local-trips";
import { readUserPrefs } from "@/lib/user-prefs";

type Props = {
  locale: Locale;
  initialTemplateId?: string;
};

function applyTemplateDefaults(
  tpl: TemplateCard | undefined,
  locale: Locale,
  setTitle: (v: string) => void,
  setDestination: (v: string) => void,
  onlyIfEmpty: { title: string; destination: string },
) {
  if (!tpl) return;
  if (!onlyIfEmpty.title.trim()) {
    setTitle(tpl.title[locale] ?? tpl.title["zh-CN"]);
  }
  if (!onlyIfEmpty.destination.trim()) {
    setDestination(tpl.destination);
  }
}

export function CreateTripForm({ locale, initialTemplateId }: Props) {
  const router = useRouter();
  const seed = templateCardsFromSeed();
  const initialTpl = seed.find((x) => x.id === initialTemplateId);
  const [title, setTitle] = useState(
    initialTpl ? initialTpl.title[locale] ?? initialTpl.title["zh-CN"] : "",
  );
  const [destination, setDestination] = useState(
    initialTpl?.destination ?? "",
  );
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [templateId, setTemplateId] = useState(initialTemplateId ?? "");
  const [templates, setTemplates] = useState<TemplateCard[]>(() => seed);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      void apiGet<{ templates: TemplateCard[] }>("/v1/templates")
        .then((res) => {
          if (res.templates?.length) setTemplates(res.templates);
        })
        .catch(() => {
          /* seed templates already shown */
        });
    });
  }, []);

  function onTemplateChange(nextId: string) {
    setTemplateId(nextId);
    applyTemplateDefaults(
      templates.find((x) => x.id === nextId),
      locale,
      setTitle,
      setDestination,
      { title, destination },
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t(locale, "trips.create.titleRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setSoftNotice(null);

    try {
      if (templateId) {
        const res = await apiSend<{ trip: Trip }>(
          `/v1/templates/${templateId}/create`,
          "POST",
          {
            title: trimmed,
            startDate: startDate || undefined,
          },
        );
        router.push(`/trips/${res.trip.id}`);
        return;
      }

      const res = await apiSend<{ trip: Trip }>("/v1/trips", "POST", {
        title: trimmed,
        destination: destination.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        locale,
      });
      const preferredEngine = readUserPrefs().mapEngine;
      if (preferredEngine !== "auto") {
        try {
          await apiSend(`/v1/trips/${res.trip.id}`, "PATCH", {
            mapEngine: preferredEngine,
          });
        } catch {
          // Soft-fail: trip exists; planner can still change engine.
        }
      }
      router.push(`/trips/${res.trip.id}`);
    } catch (err) {
      if (isPlannerNoiseError(err)) {
        const local = createBlankLocalTrip({
          title: trimmed,
          destination: destination.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          locale,
          mapEngine: readUserPrefs().mapEngine,
          templateId: templateId || undefined,
        });
        setSoftNotice(t(locale, "trips.create.demoLocal"));
        router.push(`/trips/${local.trip.id}`);
        return;
      }
      setError(
        err instanceof Error ? err.message : t(locale, "trips.create.failed"),
      );
      setBusy(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-xl px-6 pb-28 pt-6 md:px-10 md:pt-10">
      <div
        aria-hidden
        className="bp-topo pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 opacity-50"
      />

      <div className="animate-rise">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
          Beaver Plan · 海狸旅行
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {t(locale, "trips.create.title")}
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-ink-soft">
          {t(locale, "trips.create.support")}
        </p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="animate-sheet-in mt-12 space-y-7"
      >
        <label className="block">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            {t(locale, "trips.create.fieldTitle")}
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(locale, "trips.create.titlePlaceholder")}
            className="mt-2 w-full border-0 border-b border-[color:var(--bp-line)] bg-transparent px-0 py-3 font-display text-2xl font-semibold text-ink outline-none ring-0 placeholder:text-ink-soft/40 focus:border-river"
            autoFocus
            required
          />
        </label>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {t(locale, "trips.create.fieldCity")}
            </span>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={t(locale, "trips.create.cityPlaceholder")}
              className="mt-2 w-full border-0 border-b border-[color:var(--bp-line)] bg-transparent px-0 py-2.5 text-base text-ink outline-none placeholder:text-ink-soft/40 focus:border-river"
            />
          </label>
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {t(locale, "trips.create.fieldTemplate")}
            </span>
            <select
              value={templateId}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="mt-2 w-full border-0 border-b border-[color:var(--bp-line)] bg-transparent px-0 py-2.5 text-base text-ink outline-none focus:border-river"
            >
              <option value="">{t(locale, "trips.create.noTemplate")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.title[locale] ?? tpl.title["zh-CN"]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {t(locale, "trips.create.fieldStart")}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate && e.target.value && endDate < e.target.value) {
                  setEndDate(e.target.value);
                }
              }}
              className="mt-2 w-full border-0 border-b border-[color:var(--bp-line)] bg-transparent px-0 py-2.5 text-base text-ink outline-none focus:border-river"
            />
          </label>
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              {t(locale, "trips.create.fieldEnd")}
            </span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-2 w-full border-0 border-b border-[color:var(--bp-line)] bg-transparent px-0 py-2.5 text-base text-ink outline-none focus:border-river"
            />
          </label>
        </div>

        {error ? (
          <p className="rounded-bp-sm border border-timber/25 bg-timber/8 px-4 py-3 text-sm text-timber" role="alert">
            {error}
          </p>
        ) : null}
        <SoftFailNotice open={!error && Boolean(softNotice)}>
          {softNotice ?? ""}
        </SoftFailNotice>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-bp bg-river px-6 py-3 text-sm font-semibold text-foam transition hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? t(locale, "trips.creating")
              : t(locale, "trips.create.submit")}
          </button>
          <Link
            href="/trips"
            className="text-sm font-semibold text-ink-soft transition hover:text-river"
          >
            {t(locale, "trips.create.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
