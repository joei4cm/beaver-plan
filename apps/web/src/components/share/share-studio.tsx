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
import {
  SHARE_ACCENT_PRESETS,
  SHARE_TEMPLATES,
  getShareTemplate,
  renderShareSvg,
  stopsForDay,
  svgToDataUrl,
  type ShareSnapshot,
} from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { apiBase, apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
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

function svgInnerMarkup(svg: string): string {
  const trimmed = svg.trim();
  const open = trimmed.indexOf("<svg");
  if (open < 0) return trimmed;
  const close = trimmed.indexOf(">", open);
  if (close < 0) return trimmed;
  return trimmed.slice(open, trimmed.lastIndexOf("</svg>") + 6);
}

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
  const [softDemo, setSoftDemo] = useState(false);
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
    let tripData = initialTrip;
    if (!tripData) {
      try {
        tripData = await apiGet<TripPayload>(`/v1/trips/${tripId}`);
      } catch {
        tripData = null;
      }
    }
    if (!tripData) {
      setError("not_found");
      return;
    }
    let journalEntries: JournalEntry[] = [];
    try {
      const journal = await apiGet<{ entries: JournalEntry[] }>(
        `/v1/trips/${tripId}/journal`,
      );
      journalEntries = journal.entries;
    } catch {
      journalEntries = [];
    }
    setTrip(tripData.trip);
    setDays(tripData.days);
    setStops(tripData.stops);
    setDayId((prev) => prev ?? tripData.days[0]?.id ?? null);
    setEntries(journalEntries);
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

  const buildLocalPreview = useCallback((): RenderResponse | null => {
    if (!trip) return null;
    const template = getShareTemplate(templateId);
    if (!template) return null;
    const day = days.find((d) => d.id === dayId);
    const dayStopList = dayId ? stopsForDay(stops, dayId) : [];
    const photos: string[] = [];
    for (const e of entries) {
      if (dayId && e.dayId !== dayId && !dayStopList.some((s) => s.id === e.stopId)) {
        continue;
      }
      for (const u of e.media) photos.push(resolveMediaUrl(u));
    }
    const snap: ShareSnapshot = {
      tripTitle: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      dayLabel: day?.note,
      dayDate: day?.date,
      places: dayStopList.map((s) => s.place.name),
      photos,
      note: day?.note,
      pathPoints: dayStopList.map((s) => ({
        lat: s.place.lat,
        lng: s.place.lng,
      })),
      locale: trip.locale === "en" ? "en" : "zh-CN",
      style: stylePayload,
    };
    const svg = renderShareSvg(templateId, snap);
    return {
      template,
      svg,
      previewUrl: svgToDataUrl(svg),
    };
  }, [trip, days, stops, entries, dayId, templateId, stylePayload]);

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
      setSoftDemo(false);
    } catch (e) {
      const local = buildLocalPreview();
      if (local) {
        setPreview(local);
        setError(null);
        setSoftDemo(true);
      } else if (isPlannerNoiseError(e)) {
        setSoftDemo(true);
        setError(null);
      } else {
        setError("render_failed");
      }
    } finally {
      setBusy(false);
    }
  }, [tripId, templateId, dayId, stylePayload, buildLocalPreview]);

  useEffect(() => {
    if (!trip || !editSeeded) return;
    const timer = window.setTimeout(() => {
      void render();
    }, 280);
    return () => window.clearTimeout(timer);
  }, [trip, templateId, dayId, stylePayload, editSeeded, render]);

  function resetEdits() {
    if (!trip) return;
    setCoverTitle(trip.title);
    setCoverSubtitle(trip.destination ?? "");
    setAccentColor(DEFAULT_ACCENT);
    setTitleScale(1);
  }

  function pickTemplate(id: ShareTemplateId) {
    if (id === templateId) return;
    setTemplateId(id);
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
  const previewKey = preview
    ? `${preview.template.id}-${preview.previewUrl.slice(-48)}`
    : templateId;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-4 md:px-8 md:pt-8">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--bp-line)] pb-8">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
            Beaver Plan · {t(locale, "share.eyebrow")}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
            {t(locale, "share.title")}
          </h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            {t(locale, "share.support")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/trips/${tripId}/journal`}
            className="px-4 py-2 text-sm text-ink-soft underline-offset-4 transition hover:text-river hover:underline"
          >
            {t(locale, "share.toJournal")}
          </Link>
          <Link
            href={`/trips/${tripId}`}
            className="px-4 py-2 text-sm text-ink-soft underline-offset-4 transition hover:text-river hover:underline"
          >
            {t(locale, "journal.backPlanner")}
          </Link>
        </div>
      </header>

      <div className="mt-8 flex gap-0 overflow-x-auto border-b border-[color:var(--bp-line)]">
        {days.map((day, i) => (
          <button
            key={day.id}
            type="button"
            onClick={() => setDayId(day.id)}
            className={`shrink-0 px-5 py-3 text-left transition duration-200 ${
              dayId === day.id
                ? "bg-river text-foam"
                : "text-ink-soft hover:bg-mist/70 hover:text-ink"
            }`}
          >
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
              {t(locale, "planner.day")} {i + 1}
            </span>
            <span className="text-sm font-semibold">{day.date}</span>
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(280px,0.7fr)]">
        <div className="animate-fade flex flex-col items-center">
          <div
            className="animate-template-swap relative w-full max-w-[420px] overflow-hidden border border-[color:var(--bp-line)] bg-paper shadow-bp transition-[aspect-ratio] duration-300 ease-out"
            key={`frame-${templateId}`}
            style={{
              aspectRatio: `${active.width} / ${active.height}`,
            }}
          >
            {preview ? (
              <div
                key={previewKey}
                className="share-svg-preview animate-preview-in h-full w-full [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svgInnerMarkup(preview.svg) }}
                role="img"
                aria-label={
                  locale === "zh-CN" ? active.nameZh : active.nameEn
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-ink-soft">
                <span className="font-display text-lg text-ink/80">
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
          <div className="space-y-2.5">
            {templates.map((tpl) => {
              const selected = templateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => pickTemplate(tpl.id)}
                  className={`group w-full rounded-[14px] border px-4 py-3.5 text-left transition duration-200 ${
                    selected
                      ? "border-river bg-river/10 shadow-[inset_3px_0_0_var(--bp-river)]"
                      : "border-[color:var(--bp-line)] bg-foam/60 hover:border-river/40 hover:bg-foam"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-xl tracking-tight text-ink">
                      {locale === "zh-CN" ? tpl.nameZh : tpl.nameEn}
                    </span>
                    <span
                      className={`font-mono text-[11px] transition ${
                        selected ? "text-river" : "text-ink-soft"
                      }`}
                    >
                      {tpl.aspect}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {locale === "zh-CN" ? tpl.blurbZh : tpl.blurbEn}
                  </p>
                </button>
              );
            })}
          </div>

          <section className="space-y-3 border-t border-[color:var(--bp-line)] pt-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl text-ink">
                {t(locale, "share.lightEdit")}
              </h2>
              <button
                type="button"
                onClick={resetEdits}
                className="text-xs text-ink-soft underline-offset-4 transition hover:text-river hover:underline"
              >
                {t(locale, "share.resetEdit")}
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                {t(locale, "share.coverTitle")}
              </span>
              <input
                type="text"
                value={coverTitle}
                maxLength={80}
                onChange={(e) => setCoverTitle(e.target.value)}
                className="w-full rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-3 py-2 text-sm text-ink outline-none transition focus:border-river/50 focus:ring-2 focus:ring-focus/30"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                {t(locale, "share.coverSubtitle")}
              </span>
              <input
                type="text"
                value={coverSubtitle}
                maxLength={100}
                onChange={(e) => setCoverSubtitle(e.target.value)}
                className="w-full rounded-md border border-[color:var(--bp-line)] bg-foam/80 px-3 py-2 text-sm text-ink outline-none transition focus:border-river/50 focus:ring-2 focus:ring-focus/30"
              />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
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
                        : "border-[color:var(--bp-line)] hover:scale-105"
                    }`}
                    style={{ backgroundColor: hex }}
                    aria-label={hex}
                  />
                ))}
              </div>
            </div>

            <label className="block space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
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
                className="w-full accent-[color:var(--bp-river,#2F6BFF)]"
              />
            </label>
          </section>

          {error && !isPlannerNoiseError(new Error(error)) && (
            <p className="text-sm text-timber" role="alert">
              {error}
            </p>
          )}

          {softDemo && !error && (
            <SoftFailNotice>
              {t(locale, "share.demoNotice")}
            </SoftFailNotice>
          )}

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

          {!softDemo && (
            <p className="text-xs leading-relaxed text-ink-soft/80">
              {t(locale, "share.demoHint")}
            </p>
          )}

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
