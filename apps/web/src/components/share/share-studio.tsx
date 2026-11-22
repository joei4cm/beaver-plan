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
import {
  SoftFailBadge,
  SoftFailLiveBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashClass,
} from "@/components/soft-fail-notice";
import { SheetPresence } from "@/components/ui/sheet-presence";
import { ShareStudioSkeleton } from "@/components/ui/skeleton";
import { apiBase, apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
import {
  SHARE_EXPORT_SCALE,
  downloadBlob,
  svgToPngBlob,
} from "@/lib/export-png";
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

/** Azure section eyebrow — matches booking / day-fill / place-intel depth. */
function SectionEyebrow({ children }: { children: string }) {
  return (
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
      {children}
    </p>
  );
}

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
  const [exportSoftFail, setExportSoftFail] = useState(false);
  /** Craft preview: /trips/…/share?emptySoftFail=1 — SoftFail depth under empty canvas. */
  const [emptySoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("emptySoftFail") === "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…/share?studioSoftFail=1 — SoftFail depth under Studio. */
  const [studioSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("studioSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  /** Craft preview: /trips/…/share?exportSoftFail=1 — SoftFail depth under Export. */
  const [exportSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("exportSoftFail") ===
        "1"
      );
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [swapTick, setSwapTick] = useState(0);
  /** Bumps past 0 to leave empty SoftFail chrome and kick the first render (BEA-240). */
  const [renderKick, setRenderKick] = useState(0);

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
    // Empty SoftFail owns first paint (BEA-240) — no auto-render until CTA /
    // template pick / day change kicks renderKick, or a preview already exists.
    if (!preview && renderKick === 0) return;
    const timer = window.setTimeout(() => {
      void render();
    }, 280);
    return () => window.clearTimeout(timer);
  }, [
    trip,
    templateId,
    dayId,
    stylePayload,
    editSeeded,
    render,
    preview,
    renderKick,
  ]);

  function resetEdits() {
    if (!trip) return;
    setCoverTitle(trip.title);
    setCoverSubtitle(trip.destination ?? "");
    setAccentColor(DEFAULT_ACCENT);
    setTitleScale(1);
  }

  function kickRender() {
    setRenderKick((n) => n + 1);
  }

  function pickTemplate(id: ShareTemplateId) {
    if (id === templateId) {
      kickRender();
      return;
    }
    setTemplateId(id);
    setSwapTick((n) => n + 1);
    // Persist as default — multiple templates preference (settings + next open).
    patchUserPrefs({ shareImageTemplateId: id });
    kickRender();
  }

  async function downloadPng() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setExportSoftFail(false);
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
    } catch {
      // Demo / keys-missing path: soft-fail — keep local SVG preview, never timber.
      setExportSoftFail(true);
      setError(null);
      if (!softDemo) setSoftDemo(true);
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
    setExportSoftFail(false);
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
      // Soft-fail export demo — never surface raw Failed to fetch / encode noise.
      setExportSoftFail(true);
      setError(null);
      if (!softDemo) setSoftDemo(true);
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

  /**
   * SoftFail helpers (BEA-397 after #284 / depth BEA-331 + BEA-315 #243) +
   * craft SoftFail query parity (BEA-404): SoftFailBadge Soft/Live ·
   * SoftFailSupport · SoftFailNotice mist band · softFailMistWashClass tip-011 ·
   * empty canvas owns SoftFail under azure canvas rail · Studio sheet owns
   * softDemo under azure Studio rail · Export owns exportSoftFail under Export
   * rail · Studio SoftFail yields while Export owns (no double depth). Craft:
   * /trips/…/share?emptySoftFail=1 · ?studioSoftFail=1 · ?exportSoftFail=1 —
   * SoftFail depth without a render/export miss. Soft copy never timber /
   * Failed to fetch. No /dev SoftFail gallery.
   */
  const canvasEmpty = !preview;
  const emptyOwnsSoft = canvasEmpty && editSeeded;
  const exportOwnsSoft =
    !emptyOwnsSoft && (exportSoftFail || exportSoftPreview);
  const sheetOwnsSoft =
    !emptyOwnsSoft &&
    !exportOwnsSoft &&
    (softDemo || studioSoftPreview);
  const emptySoftOpen =
    emptyOwnsSoft &&
    (emptySoftPreview ||
      softDemo ||
      studioSoftPreview ||
      exportSoftFail ||
      exportSoftPreview ||
      !busy);
  /** Studio SoftFail under azure sheet rail — yields while empty / Export owns. */
  const sheetSoftOpen = sheetOwnsSoft;
  const emptySoftCopy =
    exportSoftFail || exportSoftPreview
      ? t(locale, "share.exportSoftFail")
      : softDemo || studioSoftPreview || emptyOwnsSoft
        ? t(locale, "share.emptySoftFail")
        : t(locale, "share.demoNotice");
  const sheetSoftCopy = t(locale, "share.softFail");
  const exportSoftCopy =
    exportSoftFail || exportSoftPreview
      ? t(locale, "share.exportSoftFail")
      : t(locale, "share.demoNotice");
  const sheetSupportCopy = sheetSoftOpen
    ? t(locale, "share.softSupport")
    : t(locale, "share.sheetSupport");
  const exportSupportCopy = exportOwnsSoft
    ? t(locale, "share.exportSoftSupport")
    : t(locale, "share.exportSupport");
  const softDemoChrome =
    softDemo || studioSoftPreview || exportSoftFail || exportSoftPreview;

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
              onClick={() => {
                setDayId(day.id);
                // Day change from empty SoftFail chrome kicks first render.
                if (!preview) kickRender();
              }}
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
        {/*
          Empty SoftFail helpers (BEA-397 after #284 / BEA-240) + craft SoftFail
          query parity (BEA-404): azure canvas rail · SoftFailBadge Soft/Open ·
          SoftFailSupport · SoftFailNotice mist band · softFailMistWashClass
          tip-011 · Craft: ?emptySoftFail=1 — never timber / Failed to fetch.
        */}
        <section className="animate-rise flex flex-col items-center">
          <div
            className="relative flex w-full max-w-[440px] flex-col items-center overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] p-4 shadow-bp-soft md:p-5"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 85% 60% at 18% -5%, color-mix(in srgb, var(--bp-river) 16%, transparent), transparent 55%), linear-gradient(165deg, var(--bp-foam) 0%, var(--bp-paper) 48%, color-mix(in srgb, var(--bp-river) 18%, var(--bp-foam)) 130%)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-y-5 left-0 w-1 rounded-r-full bg-river"
              style={{
                boxShadow:
                  "0 0 12px color-mix(in srgb, var(--bp-river) 35%, transparent)",
              }}
            />
            <div className="mb-0 flex w-full max-w-[400px] items-center justify-between gap-2 pl-2">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                  {t(locale, "share.canvasEyebrow")}
                </p>
                {canvasEmpty ? (
                  <SoftFailSupport>
                    {emptySoftOpen
                      ? t(locale, "share.emptySoftSupport")
                      : t(locale, "share.emptySupport")}
                  </SoftFailSupport>
                ) : null}
              </div>
              {canvasEmpty ? (
                emptySoftOpen ? (
                  <SoftFailBadge>
                    {t(locale, "share.emptySoftBadge")}
                  </SoftFailBadge>
                ) : (
                  <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river bp-transition">
                    {t(locale, "share.emptyBadge")}
                  </span>
                )
              ) : (
                <p className="font-mono text-[10px] tracking-wide text-ink-soft">
                  {active.width}×{active.height} · {SHARE_EXPORT_SCALE}× PNG
                </p>
              )}
            </div>

            {/* Compact SoftFail mist band under azure canvas rail — Studio SoftFail yields. */}
            <div className="w-full max-w-[400px]">
              <SoftFailNotice
                open={emptySoftOpen}
                compact
                className="border-b border-[color:var(--bp-line)]"
              >
                {emptySoftCopy}
              </SoftFailNotice>
            </div>

            <div
              className={`animate-template-swap relative mt-3 w-full max-w-[400px] overflow-hidden rounded-bp border bg-foam shadow-bp transition-[aspect-ratio] duration-bp ease-bp-in-out ${
                softDemoChrome || emptyOwnsSoft
                  ? "border-river/35 ring-2 ring-river/20"
                  : "border-[color:var(--bp-line)]"
              }`}
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
              ) : busy && !emptySoftOpen ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-ink-soft">
                  <div className="bp-skeleton h-8 w-40" />
                  <span className="text-sm">{t(locale, "share.rendering")}</span>
                </div>
              ) : (
                <SheetPresence
                  open
                  className={`flex h-full flex-col items-start justify-center px-6 py-8 ${
                    emptySoftOpen ? softFailMistWashClass : ""
                  }`}
                  style={{ animationDelay: "40ms" }}
                  aria-label={t(locale, "share.empty")}
                >
                  <p
                    className="animate-rise text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river"
                    style={{ animationDelay: "40ms" }}
                  >
                    {t(locale, "share.canvasEyebrow")}
                  </p>
                  <p
                    className="animate-rise mt-2 font-display text-2xl font-semibold tracking-tight text-ink md:text-[1.65rem]"
                    style={{ animationDelay: "70ms" }}
                  >
                    {t(locale, "share.empty")}
                  </p>
                  <p
                    className="animate-rise mt-2 max-w-sm text-sm leading-relaxed text-ink-soft"
                    style={{ animationDelay: "100ms" }}
                  >
                    {busy
                      ? t(locale, "share.rendering")
                      : t(locale, "share.emptyHint")}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      kickRender();
                      void render();
                    }}
                    className="animate-rise mt-6 rounded-bp bg-river px-4 py-2.5 text-sm font-semibold tracking-wide text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ animationDelay: "130ms" }}
                  >
                    {t(locale, "share.emptyCta")}
                  </button>
                </SheetPresence>
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

        {/*
          Studio SoftFail helpers (BEA-397 after #284 / depth BEA-315) + craft
          SoftFail query parity (BEA-404): azure Studio rail · SoftFailBadge Soft
          studio / Demo · SoftFailSupport · SoftFailNotice mist band ·
          softFailMistWashClass tip-011 · Craft: ?studioSoftFail=1 — Empty +
          Export SoftFail ownership yield (no double depth) — never timber /
          Failed to fetch.
        */}
        <SheetPresence
          open
          className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
          style={{ animationDelay: "80ms" }}
          aria-label={t(locale, "share.sheetEyebrow")}
        >
          <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)] sm:px-5">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
                {t(locale, "share.sheetEyebrow")}
              </span>
              <SoftFailSupport>{sheetSupportCopy}</SoftFailSupport>
            </div>
            {sheetSoftOpen || softDemoChrome || emptyOwnsSoft ? (
              <SoftFailBadge>
                {sheetSoftOpen
                  ? t(locale, "share.softBadge")
                  : t(locale, "share.demoBadge")}
              </SoftFailBadge>
            ) : (
              <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                {t(locale, "share.liveBadge")}
              </SoftFailLiveBadge>
            )}
          </header>

          {/* Compact SoftFail under azure Studio rail — yields while empty / Export own. */}
          <SoftFailNotice
            open={sheetSoftOpen}
            compact
            className="border-b border-[color:var(--bp-line)]"
          >
            {sheetSoftCopy}
          </SoftFailNotice>

          <div
            className={`animate-rise space-y-5 px-4 py-4 ${
              sheetSoftOpen ? softFailMistWashClass : ""
            }`}
            style={{ animationDelay: "70ms" }}
          >
            <section
              className="animate-rise space-y-3"
              style={{ animationDelay: "40ms" }}
              aria-labelledby="share-template-heading"
            >
              <div>
                <SectionEyebrow>
                  {t(locale, "share.templatesEyebrow")}
                </SectionEyebrow>
                <h2
                  id="share-template-heading"
                  className="mt-1 font-display text-xl tracking-tight text-ink md:text-2xl"
                >
                  {t(locale, "share.pickTemplate")}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {t(locale, "share.pickTemplateSupport")}
                </p>
              </div>

              <div
                className="grid grid-cols-2 gap-3"
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
                      className={`group flex flex-col overflow-hidden rounded-bp border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 ${
                        selected
                          ? "animate-template-select border-river bg-river/[0.08] shadow-bp-soft ring-2 ring-river/30"
                          : "border-[color:var(--bp-line)] bg-foam/80 transition duration-bp ease-bp-out hover:border-river/45 hover:bg-foam hover:shadow-bp-soft hover:scale-[1.01]"
                      }`}
                    >
                      {/* Aspect thumbnail — azure wash + thumb pop on select (#46) */}
                      <div
                        className={`relative flex items-end justify-center px-3 pt-3 transition duration-bp-fast ease-bp-out ${
                          selected
                            ? "bg-river/[0.12]"
                            : "bg-mist/55 group-hover:bg-mist/80"
                        }`}
                        style={{
                          minHeight: portrait ? "5.75rem" : "4.25rem",
                        }}
                      >
                        <div
                          className={`relative w-[42%] overflow-hidden rounded-bp-xs shadow-bp-soft transition duration-bp ease-bp-out ${
                            selected
                              ? "animate-template-thumb bg-gradient-to-b from-river to-river-deep"
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
                            className={`font-display text-base font-semibold leading-snug tracking-tight transition duration-bp-fast ease-bp-out ${
                              selected
                                ? "text-river"
                                : "text-ink group-hover:text-river"
                            }`}
                          >
                            {locale === "zh-CN" ? tpl.nameZh : tpl.nameEn}
                          </span>
                          {selected ? (
                            <span className="animate-rise inline-flex shrink-0 items-center gap-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-river">
                              <svg
                                viewBox="0 0 12 12"
                                className="h-3 w-3"
                                aria-hidden
                              >
                                <path
                                  d="M2.2 6.2 4.8 8.7 9.8 3.4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
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

            <section
              className="animate-rise space-y-3 border-t border-[color:var(--bp-line)] pt-5"
              style={{ animationDelay: "70ms" }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <SectionEyebrow>
                    {t(locale, "share.editEyebrow")}
                  </SectionEyebrow>
                  <h2 className="mt-1 font-display text-xl tracking-tight text-ink md:text-2xl">
                    {t(locale, "share.lightEdit")}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={resetEdits}
                  className="rounded-bp-xs px-1 py-1 text-xs text-ink-soft underline-offset-4 transition duration-bp-fast ease-bp-out hover:text-river hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35"
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
                  className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/90 px-3 py-2 text-sm text-ink outline-none transition duration-bp-fast ease-bp-out focus:border-river/50 focus:ring-2 focus:ring-focus/30"
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
                  className="w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/90 px-3 py-2 text-sm text-ink outline-none transition duration-bp-fast ease-bp-out focus:border-river/50 focus:ring-2 focus:ring-focus/30"
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
                <div
                  className="flex flex-wrap gap-1.5 rounded-bp-sm bg-mist/50 p-1.5"
                  role="group"
                  aria-label={t(locale, "share.accentColor")}
                >
                  {SHARE_ACCENT_PRESETS.map((hex) => {
                    const on =
                      accentColor.toLowerCase() === hex.toLowerCase();
                    return (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setAccentColor(hex)}
                        className={`h-7 w-7 rounded-full border transition duration-bp-fast ease-bp-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 ${
                          on
                            ? "animate-stop-select border-ink ring-2 ring-river/40"
                            : "border-[color:var(--bp-line)] hover:scale-105"
                        }`}
                        style={{ backgroundColor: hex }}
                        aria-label={hex}
                        aria-pressed={on}
                      />
                    );
                  })}
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

            {error && !isPlannerNoiseError(new Error(error)) ? (
              <p className="text-sm text-timber" role="alert">
                {error}
              </p>
            ) : null}

            {/*
              Export SoftFail helpers (BEA-397 after #284 / depth BEA-331) + craft
              SoftFail query parity (BEA-404): azure Export rail · SoftFailBadge
              Soft export / Live · SoftFailSupport · SoftFailNotice mist band ·
              softFailMistWashClass tip-011 · Craft: ?exportSoftFail=1 — Studio
              SoftFail (#243) yields while Export owns — never timber /
              Failed to fetch.
            */}
            <section
              className="animate-rise border-t border-[color:var(--bp-line)] pt-5"
              style={{ animationDelay: "100ms" }}
              aria-label={t(locale, "share.export")}
            >
              <div className="overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft">
                <div className="relative flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-3 shadow-[inset_3px_0_0_var(--bp-river)]">
                  <div className="min-w-0">
                    <SectionEyebrow>
                      {t(locale, "share.exportEyebrow")}
                    </SectionEyebrow>
                    <h2
                      id="share-export-title"
                      className="mt-1 font-display text-lg tracking-tight text-ink md:text-xl"
                    >
                      {t(locale, "share.export")}
                    </h2>
                    {exportOwnsSoft ? (
                      <SoftFailSupport className="mt-1 block">
                        {exportSupportCopy}
                      </SoftFailSupport>
                    ) : (
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                        {exportSupportCopy}
                      </p>
                    )}
                  </div>
                  {exportOwnsSoft ? (
                    <SoftFailBadge>
                      {t(locale, "share.exportSoftBadge")}
                    </SoftFailBadge>
                  ) : (
                    <SoftFailLiveBadge className="transition duration-bp-fast ease-bp-out">
                      {t(locale, "share.liveBadge")}
                    </SoftFailLiveBadge>
                  )}
                </div>

                {/* Compact SoftFail under azure Export rail — never timber / Failed to fetch. */}
                <SoftFailNotice
                  open={exportOwnsSoft}
                  compact
                  className="border-b border-[color:var(--bp-line)]"
                >
                  {exportSoftCopy}
                </SoftFailNotice>

                <SheetPresence
                  open
                  className={`flex flex-col gap-3 px-3 py-3 ${
                    exportOwnsSoft ? softFailMistWashClass : ""
                  }`}
                  style={{ animationDelay: "40ms" }}
                  role="group"
                  aria-label={t(locale, "share.export")}
                >
                  <button
                    type="button"
                    disabled={busy || !preview}
                    onClick={() => void downloadPng()}
                    className="animate-rise rounded-bp bg-river px-4 py-3.5 text-sm font-semibold tracking-wide text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foam disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ animationDelay: "40ms" }}
                    aria-labelledby="share-export-title"
                  >
                    {t(locale, "share.downloadPng")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !preview}
                    onClick={() => void shareNative()}
                    className="animate-rise rounded-bp bg-ink px-4 py-3 text-sm font-semibold text-foam transition duration-bp ease-bp-out-strong hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ animationDelay: "70ms" }}
                  >
                    {t(locale, "share.systemShare")}
                  </button>
                  <div
                    className="animate-rise flex items-center justify-between gap-3 pt-0.5"
                    style={{ animationDelay: "100ms" }}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        kickRender();
                        void render();
                      }}
                      className="rounded-bp-xs px-1 py-1.5 text-sm text-ink-soft underline-offset-4 transition duration-bp-fast ease-bp-out hover:text-river hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 disabled:opacity-40"
                    >
                      {t(locale, "share.refresh")}
                    </button>
                    {!softDemoChrome ? (
                      <p className="max-w-[16rem] text-right text-[11px] leading-relaxed text-ink-soft/75">
                        {t(locale, "share.demoHint")}
                      </p>
                    ) : null}
                  </div>
                </SheetPresence>
              </div>
            </section>

            {entries[0]?.media[0] ? (
              <div className="flex gap-2 overflow-x-auto border-t border-[color:var(--bp-line)] pt-4">
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
          </div>
        </SheetPresence>
      </div>
    </div>
  );
}
