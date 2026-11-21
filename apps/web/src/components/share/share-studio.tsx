"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
import { ShareStudioSkeleton } from "@/components/ui/skeleton";
import { apiBase, apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
import { downloadBlob, svgToPngBlob } from "@/lib/export-png";
import { resolveMediaUrl } from "@/lib/media-url";
import { patchUserPrefs, readUserPrefs } from "@/lib/user-prefs";

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
  const [templateId, setTemplateId] = useState<ShareTemplateId>(
    () => readUserPrefs().shareImageTemplateId,
  );
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
  const [swapTick, setSwapTick] = useState(0);

  const dayTabsRef = useRef<HTMLDivElement | null>(null);
  const dayTabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [dayTabIndicator, setDayTabIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

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

  useEffect(() => {
    if (!dayId) {
      setDayTabIndicator(null);
      return;
    }
    const measure = () => {
      const tab = dayTabRefs.current.get(dayId);
      if (!tab) return;
      setDayTabIndicator({
        left: tab.offsetLeft,
        width: tab.offsetWidth,
      });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [dayId, days]);

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
    setSwapTick((n) => n + 1);
    // Persist as default — multiple templates preference (settings + next open).
    patchUserPrefs({ shareImageTemplateId: id });
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
    return <ShareStudioSkeleton />;
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
    ? `${preview.template.id}-${swapTick}-${preview.previewUrl.slice(-48)}`
    : `${templateId}-${swapTick}`;

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
          <p className="mt-2 font-display text-xl font-semibold tracking-tight text-ink/85 md:text-2xl">
            {trip.title}
          </p>
          <p className="mt-3 max-w-xl text-ink-soft">
            {t(locale, "share.support")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/trips/${tripId}/journal`}
            className="bp-transition rounded-bp px-4 py-2 text-sm text-ink-soft underline-offset-4 hover:text-river hover:underline"
          >
            {t(locale, "share.toJournal")}
          </Link>
          <Link
            href={`/trips/${tripId}`}
            className="bp-transition rounded-bp px-4 py-2 text-sm text-ink-soft underline-offset-4 hover:text-river hover:underline"
          >
            {t(locale, "journal.backPlanner")}
          </Link>
        </div>
      </header>

      <div
        ref={dayTabsRef}
        className="relative mt-6 flex gap-0 overflow-x-auto border-b border-[color:var(--bp-line)] bg-paper/50"
        role="tablist"
        aria-label={t(locale, "share.eyebrow")}
      >
        {dayTabIndicator && (
          <span
            aria-hidden
            className="animate-tab-indicator pointer-events-none absolute inset-y-0 z-0 bg-river"
            style={{
              left: dayTabIndicator.left,
              width: dayTabIndicator.width,
            }}
          />
        )}
        {days.map((day, i) => {
          const activeDay = dayId === day.id;
          return (
            <button
              key={day.id}
              type="button"
              role="tab"
              aria-selected={activeDay}
              ref={(el) => {
                if (el) dayTabRefs.current.set(day.id, el);
                else dayTabRefs.current.delete(day.id);
              }}
              onClick={() => setDayId(day.id)}
              className={`relative z-[1] shrink-0 px-5 py-3.5 text-left transition duration-bp-fast ease-bp-out ${
                activeDay
                  ? "text-foam"
                  : "text-ink-soft hover:bg-mist/70 hover:text-ink"
              }`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
                {t(locale, "planner.day")} {i + 1}
              </span>
              <span className="text-sm font-semibold">{day.date}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(280px,0.7fr)]">
        {/* Preview stage — primary visual */}
        <section className="animate-fade flex flex-col items-center">
          <div className="flex w-full max-w-[440px] flex-col items-center rounded-bp-lg border border-[color:var(--bp-line)] bg-mist/35 p-4 shadow-bp-soft md:p-5">
            <div
              className="animate-template-swap relative w-full max-w-[400px] overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-bp transition-[aspect-ratio] duration-bp ease-bp-in-out"
              key={`frame-${templateId}-${swapTick}`}
              style={{
                aspectRatio: `${active.width} / ${active.height}`,
              }}
            >
              {preview ? (
                <div
                  key={previewKey}
                  className="share-svg-preview animate-preview-in h-full w-full [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{
                    __html: svgInnerMarkup(preview.svg),
                  }}
                  role="img"
                  aria-label={
                    locale === "zh-CN" ? active.nameZh : active.nameEn
                  }
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-ink-soft">
                  <div className="bp-skeleton h-8 w-40" />
                  <span className="text-sm">
                    {busy
                      ? t(locale, "share.rendering")
                      : t(locale, "share.loading")}
                  </span>
                </div>
              )}
            </div>
          </div>
          <p className="mt-4 max-w-md text-center text-sm text-ink-soft">
            {trip.title} · {photoCount} {t(locale, "share.photos")}
            {dayStops.length > 0
              ? ` · ${dayStops
                  .map((s) => s.place.name)
                  .slice(0, 3)
                  .join(" · ")}`
              : ""}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-river/70">
            {active.aspect} ·{" "}
            {locale === "zh-CN" ? active.nameZh : active.nameEn}
          </p>
        </section>

        {/* Control sheet — template grid → light edit → SoftFailNotice + export */}
        <aside
          className="animate-sheet-in space-y-5"
          style={{ animationDelay: "80ms" }}
        >
          <section className="space-y-3" aria-labelledby="share-template-heading">
            <div>
              <h2
                id="share-template-heading"
                className="font-display text-2xl tracking-tight text-ink"
              >
                {t(locale, "share.pickTemplate")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {t(locale, "share.pickTemplateSupport")}
              </p>
            </div>

            <div
              className="grid grid-cols-2 gap-2.5"
              role="listbox"
              aria-label={t(locale, "share.pickTemplate")}
            >
              {templates.map((tpl) => {
                const selected = templateId === tpl.id;
                const portrait = tpl.aspect === "9:16";
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pickTemplate(tpl.id)}
                    className={`group flex flex-col overflow-hidden rounded-bp border text-left transition duration-bp ease-bp-out ${
                      selected
                        ? "animate-stop-select border-river bg-river/[0.08] shadow-bp-soft ring-2 ring-river/30"
                        : "border-[color:var(--bp-line)] bg-foam/80 hover:border-river/45 hover:bg-foam hover:shadow-bp-soft"
                    }`}
                  >
                    {/* Aspect thumbnail — azure wash silhouette (#46 radii) */}
                    <div
                      className={`relative flex items-end justify-center px-3 pt-3 transition duration-bp-fast ease-bp-out ${
                        selected
                          ? "bg-river/[0.12]"
                          : "bg-mist/55 group-hover:bg-mist/80"
                      }`}
                      style={{ minHeight: portrait ? "5.75rem" : "4.25rem" }}
                    >
                      <div
                        className={`relative w-[42%] overflow-hidden rounded-bp-xs shadow-bp-soft transition duration-bp ease-bp-out ${
                          selected
                            ? "bg-gradient-to-b from-river to-river-deep"
                            : "bg-gradient-to-b from-river/55 to-ink/70 group-hover:from-river/75"
                        }`}
                        style={{
                          aspectRatio: `${tpl.width} / ${tpl.height}`,
                          maxHeight: portrait ? "4.75rem" : "3.35rem",
                        }}
                        aria-hidden
                      >
                        <div className="mt-[18%] mx-[12%] h-[6%] rounded-full bg-foam/55" />
                        <div className="mt-[10%] mx-[12%] h-[4%] w-[55%] rounded-full bg-foam/30" />
                        <div className="absolute inset-x-[14%] bottom-[14%] h-[3%] rounded-full bg-foam/25" />
                      </div>
                      <span
                        className={`absolute right-2 top-2 rounded-bp-xs px-1.5 py-0.5 font-mono text-[10px] tracking-wide transition duration-bp-fast ease-bp-out ${
                          selected
                            ? "bg-river text-foam"
                            : "bg-foam/90 text-ink-soft ring-1 ring-[color:var(--bp-line)] group-hover:text-river"
                        }`}
                      >
                        {tpl.aspect}
                      </span>
                    </div>

                    <div className="flex flex-1 flex-col gap-1 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-1.5">
                        <span
                          className={`font-display text-[0.95rem] font-semibold leading-snug tracking-tight transition duration-bp-fast ease-bp-out ${
                            selected ? "text-river" : "text-ink group-hover:text-river"
                          }`}
                        >
                          {locale === "zh-CN" ? tpl.nameZh : tpl.nameEn}
                        </span>
                        {selected ? (
                          <span className="shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river">
                            {t(locale, "share.selected")}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] leading-snug text-ink-soft">
                        {locale === "zh-CN" ? tpl.blurbZh : tpl.blurbEn}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3 border-t border-[color:var(--bp-line)] pt-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl tracking-tight text-ink">
                {t(locale, "share.lightEdit")}
              </h2>
              <button
                type="button"
                onClick={resetEdits}
                className="bp-transition text-xs text-ink-soft underline-offset-4 hover:text-river hover:underline"
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
                className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/90 px-3 py-2 text-sm text-ink outline-none bp-transition focus:border-river/50 focus:ring-2 focus:ring-focus/30"
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
                className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/90 px-3 py-2 text-sm text-ink outline-none bp-transition focus:border-river/50 focus:ring-2 focus:ring-focus/30"
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
                  className="h-8 w-10 cursor-pointer rounded-bp-xs border border-[color:var(--bp-line)] bg-transparent"
                  aria-label={t(locale, "share.accentColor")}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {SHARE_ACCENT_PRESETS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setAccentColor(hex)}
                    className={`h-7 w-7 rounded-full border bp-transition ${
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

          {/* Export — SoftFailNotice above CTAs; river primary / ink secondary */}
          <section className="space-y-3 border-t border-[color:var(--bp-line)] pt-5">
            <div>
              <h2 className="font-display text-2xl tracking-tight text-ink">
                {t(locale, "share.export")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {t(locale, "share.exportSupport")}
              </p>
            </div>

            {softDemo ? (
              <SoftFailNotice>
                {t(locale, "share.demoNotice")}
              </SoftFailNotice>
            ) : null}

            <div
              className="flex flex-col gap-2.5"
              role="group"
              aria-label={t(locale, "share.export")}
            >
              <button
                type="button"
                disabled={busy || !preview}
                onClick={() => void downloadPng()}
                className="rounded-bp bg-river px-4 py-3.5 text-sm font-semibold tracking-wide text-foam shadow-bp-soft transition duration-bp ease-bp hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t(locale, "share.downloadPng")}
              </button>
              <button
                type="button"
                disabled={busy || !preview}
                onClick={() => void shareNative()}
                className="rounded-bp bg-ink px-4 py-3 text-sm font-semibold text-foam transition duration-bp ease-bp-out hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t(locale, "share.systemShare")}
              </button>
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void render()}
                  className="rounded-bp px-1 py-1.5 text-sm text-ink-soft underline-offset-4 transition duration-bp-fast ease-bp-out hover:text-river hover:underline disabled:opacity-40"
                >
                  {t(locale, "share.refresh")}
                </button>
                {!softDemo ? (
                  <p className="max-w-[16rem] text-right text-[11px] leading-relaxed text-ink-soft/75">
                    {t(locale, "share.demoHint")}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {entries[0]?.media[0] ? (
            <div className="flex gap-2 overflow-x-auto pt-1">
              {entries
                .flatMap((e) => e.media)
                .slice(0, 5)
                .map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={resolveMediaUrl(url)}
                    alt=""
                    className="h-14 w-10 shrink-0 rounded-bp-xs object-cover ring-1 ring-[color:var(--bp-line)]"
                  />
                ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
