"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type {
  Day,
  JournalEntry,
  ShareStyle,
  ShareTemplateId,
  ShareTemplateMeta,
  Stop,
  Trip,
} from "@beaver/core";
import { SHARE_ACCENT_PRESETS, SHARE_TEMPLATES, stopsForDay } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { apiBase, apiGet, apiSend } from "@/lib/api";
import { downloadBlob, svgToPngBlob } from "@/lib/export-png";
import { resolveMediaUrl } from "@/lib/media-url";

type TripPayload = {
  trip: Trip;
  days: Day[];
  stops: Stop[];
};

type RenderResponse = {
  template: ShareTemplateMeta;
  svg: string;
  previewUrl: string;
};

type Props = {
  tripId: string;
  locale: Locale;
  initialTrip: TripPayload | null;
};

const DEFAULT_ACCENT = SHARE_ACCENT_PRESETS[0];

export function ShareStudio({ tripId, locale, initialTrip }: Props) {
  const [trip, setTrip] = useState<Trip | null>(initialTrip?.trip ?? null);
  const [days, setDays] = useState<Day[]>(initialTrip?.days ?? []);
  const [stops, setStops] = useState<Stop[]>(initialTrip?.stops ?? []);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [dayId, setDayId] = useState<string | null>(
    initialTrip?.days[0]?.id ?? null,
  );
  const [templateId, setTemplateId] = useState<ShareTemplateId>("magazine-reel");
  const [coverTitle, setCoverTitle] = useState("");
  const [coverSubtitle, setCoverSubtitle] = useState("");
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT);
  const [titleScale, setTitleScale] = useState(1);
  const [editSeeded, setEditSeeded] = useState(false);
  const [preview, setPreview] = useState<RenderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  const templates = SHARE_TEMPLATES;

  const stylePayload = useMemo((): ShareStyle => {
    const style: ShareStyle = {
      accentColor,
      titleScale,
    };
    if (coverTitle.trim()) style.coverTitle = coverTitle.trim();
    if (coverSubtitle.trim()) style.coverSubtitle = coverSubtitle.trim();
    return style;
  }, [accentColor, coverSubtitle, coverTitle, titleScale]);

  const load = useCallback(async () => {
    const [tripData, journal] = await Promise.all([
      initialTrip
        ? Promise.resolve(initialTrip)
        : apiGet<TripPayload>(`/v1/trips/${tripId}`),
      apiGet<{ entries: JournalEntry[] }>(`/v1/trips/${tripId}/journal`),
    ]);
    setTrip(tripData.trip);
    setDays(tripData.days);
    setStops(tripData.stops);
    setDayId((prev) => prev ?? tripData.days[0]?.id ?? null);
    setEntries(journal.entries);
    if (!editSeeded) {
      setCoverTitle(tripData.trip.title);
      setCoverSubtitle(tripData.trip.destination ?? "");
      setEditSeeded(true);
    }
  }, [editSeeded, initialTrip, tripId]);

  useEffect(() => {
    startTransition(() => {
      void load().catch((e: Error) => setError(e.message));
    });
  }, [load]);

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );

  const photoCount = useMemo(() => {
    const urls = new Set<string>();
    for (const e of entries) {
      if (dayId && e.dayId !== dayId && !dayStops.some((s) => s.id === e.stopId)) {
        continue;
      }
      for (const u of e.media) urls.add(u);
    }
    return urls.size;
  }, [entries, dayId, dayStops]);

  const render = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<RenderResponse>(
        `/v1/trips/${tripId}/share`,
        "POST",
        {
          templateId,
          dayId: dayId ?? undefined,
          mediaBaseUrl: apiBase(),
          persist: true,
          style: stylePayload,
        },
      );
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "render_failed");
    } finally {
      setBusy(false);
    }
  }, [tripId, templateId, dayId, stylePayload]);

  useEffect(() => {
    if (!trip || !editSeeded) return;
    const timer = window.setTimeout(() => {
      void render();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [trip, templateId, dayId, stylePayload, editSeeded, render]);

  function resetEdits() {
    if (!trip) return;
    setCoverTitle(trip.title);
    setCoverSubtitle(trip.destination ?? "");
    setAccentColor(DEFAULT_ACCENT);
    setTitleScale(1);
  }

  async function downloadPng() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await svgToPngBlob(
        preview.svg,
        preview.template.width,
        preview.template.height,
      );
      downloadBlob(
        blob,
        `beaver-plan-${preview.template.id}-${tripId}.png`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "png_failed");
    } finally {
      setBusy(false);
    }
  }

  async function shareNative() {
    if (!preview || typeof navigator === "undefined" || !navigator.share) {
      await downloadPng();
      return;
    }
    setBusy(true);
    try {
      const blob = await svgToPngBlob(
        preview.svg,
        preview.template.width,
        preview.template.height,
      );
      const file = new File(
        [blob],
        `beaver-plan-${preview.template.id}.png`,
        { type: "image/png" },
      );
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: trip?.title ?? "Beaver Plan",
          text: locale === "zh-CN" ? "海狸旅行 · 行程分享" : "Beaver Plan share",
        });
      } else {
        await downloadPng();
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "share_failed");
    } finally {
      setBusy(false);
    }
  }

  if (!trip && pending) {
    return (
      <div className="px-6 py-20 text-ink-soft md:px-10">
        {t(locale, "share.loading")}
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="px-6 py-20 text-ink-soft md:px-10">
        {error ?? t(locale, "planner.notFound")}
      </div>
    );
  }

  const active = templates.find((x) => x.id === templateId)!;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-4 md:px-8 md:pt-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-river/80">
            {t(locale, "share.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-ink md:text-5xl">
            {t(locale, "share.title")}
          </h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            {t(locale, "share.support")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/trips/${tripId}/journal`}
            className="rounded-md border border-[color:var(--bp-line)] bg-foam/60 px-4 py-2 text-sm text-ink-soft transition hover:border-river/40 hover:text-river"
          >
            {t(locale, "share.toJournal")}
          </Link>
          <Link
            href={`/trips/${tripId}`}
            className="rounded-md border border-[color:var(--bp-line)] bg-foam/60 px-4 py-2 text-sm text-ink-soft transition hover:border-river/40 hover:text-river"
          >
            {t(locale, "journal.backPlanner")}
          </Link>
        </div>
      </header>

      <div className="mt-8 flex gap-2 overflow-x-auto pb-1">
        {days.map((day, i) => (
          <button
            key={day.id}
            type="button"
            onClick={() => setDayId(day.id)}
            className={`shrink-0 rounded-md px-4 py-2 text-left transition ${
              dayId === day.id
                ? "bg-river-deep text-foam"
                : "border border-[color:var(--bp-line)] bg-foam/70 text-ink-soft hover:border-river/40"
            }`}
          >
            <span className="block text-[11px] uppercase tracking-wider opacity-80">
              {t(locale, "planner.day")} {i + 1}
            </span>
            <span className="text-sm font-medium">{day.date}</span>
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(280px,0.7fr)]">
        <div className="animate-fade flex flex-col items-center">
          <div
            className="relative w-full max-w-[420px] overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-river-deep/90 shadow-bp"
            style={{
              aspectRatio: `${active.width} / ${active.height}`,
            }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={preview.previewUrl}
                src={preview.previewUrl}
                alt={
                  locale === "zh-CN" ? active.nameZh : active.nameEn
                }
                className="animate-preview-in h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-foam/70">
                <span className="font-display text-lg text-foam/85">
                  Beaver Plan · 海狸旅行
                </span>
                <span className="text-sm">
                  {busy ? t(locale, "share.rendering") : t(locale, "share.loading")}
                </span>
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-sm text-ink-soft">
            {trip.title} · {photoCount} {t(locale, "share.photos")} ·{" "}
            {dayStops.map((s) => s.place.name).slice(0, 3).join(" · ")}
          </p>
        </div>

        <aside className="animate-rise space-y-5" style={{ animationDelay: "100ms" }}>
          <h2 className="font-display text-2xl text-ink">
            {t(locale, "share.pickTemplate")}
          </h2>
          <div className="space-y-3">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setTemplateId(tpl.id)}
                className={`w-full rounded-[14px] border px-4 py-4 text-left transition ${
                  templateId === tpl.id
                    ? "border-river bg-river/10"
                    : "border-[color:var(--bp-line)] bg-foam/60 hover:border-river/40"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-xl text-ink">
                    {locale === "zh-CN" ? tpl.nameZh : tpl.nameEn}
                  </span>
                  <span className="font-mono text-xs text-ink-soft">
                    {tpl.aspect}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {locale === "zh-CN" ? tpl.blurbZh : tpl.blurbEn}
                </p>
              </button>
            ))}
          </div>

          <section className="space-y-3 border-t border-[color:var(--bp-line)] pt-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl text-ink">
                {t(locale, "share.lightEdit")}
              </h2>
              <button
                type="button"
                onClick={resetEdits}
                className="text-xs text-ink-soft underline-offset-4 hover:text-river hover:underline"
              >
                {t(locale, "share.resetEdit")}
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs uppercase tracking-wider text-ink-soft">
                {t(locale, "share.coverTitle")}
              </span>
              <input
                type="text"
                value={coverTitle}
                maxLength={80}
                onChange={(e) => setCoverTitle(e.target.value)}
                className="w-full rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-3 py-2 text-sm text-ink outline-none transition focus:border-river/50"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs uppercase tracking-wider text-ink-soft">
                {t(locale, "share.coverSubtitle")}
              </span>
              <input
                type="text"
                value={coverSubtitle}
                maxLength={100}
                onChange={(e) => setCoverSubtitle(e.target.value)}
                className="w-full rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-3 py-2 text-sm text-ink outline-none transition focus:border-river/50"
              />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-ink-soft">
                  {t(locale, "share.accentColor")}
                </span>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-[color:var(--bp-line)] bg-transparent"
                  aria-label={t(locale, "share.accentColor")}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {SHARE_ACCENT_PRESETS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setAccentColor(hex)}
                    className={`h-7 w-7 rounded-full border transition ${
                      accentColor.toLowerCase() === hex.toLowerCase()
                        ? "border-ink ring-2 ring-river/40"
                        : "border-[color:var(--bp-line)]"
                    }`}
                    style={{ backgroundColor: hex }}
                    aria-label={hex}
                  />
                ))}
              </div>
            </div>

            <label className="block space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-ink-soft">
                  {t(locale, "share.titleScale")}
                </span>
                <span className="font-mono text-xs text-ink-soft">
                  {titleScale.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min={0.8}
                max={1.3}
                step={0.05}
                value={titleScale}
                onChange={(e) => setTitleScale(Number(e.target.value))}
                className="w-full accent-[color:var(--bp-river,#1f6b5c)]"
              />
            </label>
          </section>

          {error && <p className="text-sm text-timber">{error}</p>}

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              disabled={busy || !preview}
              onClick={() => void downloadPng()}
              className="rounded-md bg-river px-4 py-3 text-sm font-medium text-foam transition hover:bg-river-deep disabled:opacity-40"
            >
              {t(locale, "share.downloadPng")}
            </button>
            <button
              type="button"
              disabled={busy || !preview}
              onClick={() => void shareNative()}
              className="rounded-md border border-[color:var(--bp-line)] bg-foam/70 px-4 py-3 text-sm text-ink-soft transition hover:border-river/40 hover:text-river disabled:opacity-40"
            >
              {t(locale, "share.systemShare")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void render()}
              className="rounded-md px-4 py-2 text-sm text-ink-soft underline-offset-4 hover:text-river hover:underline"
            >
              {t(locale, "share.refresh")}
            </button>
          </div>

          <p className="text-xs leading-relaxed text-ink-soft/80">
            {t(locale, "share.demoHint")}
          </p>

          {entries[0]?.media[0] ? (
            <div className="flex gap-2 overflow-x-auto pt-2">
              {entries
                .flatMap((e) => e.media)
                .slice(0, 5)
                .map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={resolveMediaUrl(url)}
                    alt=""
                    className="h-14 w-10 shrink-0 object-cover"
                  />
                ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
