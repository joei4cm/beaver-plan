"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import type { Day, JournalEntry, Leg, Stop, Trip } from "@beaver/core";
import {
  journalForDay,
  lumenJournalPlaceholder,
  sampleKyotoFixture,
  sampleKyotoJournal,
  stopsForDay,
} from "@beaver/core";
import { brand } from "@beaver/ui-tokens";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { JournalDayScrub } from "@/components/journal/journal-day-scrub";
import { OfflinePinControl } from "@/components/offline/offline-pin-control";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { JournalSkeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, isPlannerNoiseError } from "@/lib/api";
import { fileToBase64, resolveMediaUrl, uploadJournalPhoto } from "@/lib/media-url";
import {
  enqueueJournalCreate,
  enqueueJournalDelete,
  flushJournalQueue,
  isBrowserOnline,
  isOfflineTransportError,
  readCachedTrip,
} from "@/lib/offline/trip-offline";

/** Shared focus craft for compose controls (#46 focus + tip-011 bp-transition). */
const COMPOSE_CONTROL =
  "bp-transition border border-[color:var(--bp-line)] bg-foam outline-none focus:border-river focus:ring-2 focus:ring-focus/45";

/** Azure primary CTA settle — tip-011 ease-out-strong (#46). */
const COMPOSE_CTA =
  "rounded-bp bg-river px-4 py-3 text-sm font-semibold text-foam shadow-bp-soft transition duration-bp ease-bp-out-strong hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-40";

/** Compose media rail shows three frame slots (Polarsteps-like strip). */
const PHOTO_SLOT_MAX = 3;

/** Editorial index mark — trips-index chrome for journal entries. */
function EntryIndexMark({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="w-9 shrink-0 font-display text-2xl font-bold tabular-nums leading-none text-mist md:w-10 md:text-3xl"
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

type TripPayload = {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs?: Leg[];
  journal?: JournalEntry[];
};

type Props = {
  tripId: string;
  locale: Locale;
  initialTrip: TripPayload | null;
};

type PendingLocalPhoto = {
  id: string;
  contentType: string;
  dataBase64: string;
  preview: string;
};

function MediaFrame({
  src,
  alt,
  className,
  label,
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  label: string;
  style?: CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const fallback = lumenJournalPlaceholder({
    title: label,
    subtitle: "Lumen Route",
    tone: "sky",
  });
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={broken ? fallback : src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setBroken(true)}
    />
  );
}

export function TripJournal({ tripId, locale, initialTrip }: Props) {
  const [trip, setTrip] = useState<Trip | null>(initialTrip?.trip ?? null);
  const [days, setDays] = useState<Day[]>(initialTrip?.days ?? []);
  const [stops, setStops] = useState<Stop[]>(initialTrip?.stops ?? []);
  const [legs, setLegs] = useState<Leg[]>(initialTrip?.legs ?? []);
  const [entries, setEntries] = useState<JournalEntry[]>(() => {
    if (initialTrip?.journal?.length) return initialTrip.journal;
    if (tripId === "sample-kyoto" && initialTrip) return sampleKyotoJournal();
    return [];
  });
  const [dayId, setDayId] = useState<string | null>(
    initialTrip?.days[0]?.id ?? null,
  );
  const [stopId, setStopId] = useState<string | "">("");
  const [body, setBody] = useState("");
  const [pendingMedia, setPendingMedia] = useState<string[]>([]);
  const [pendingLocalPhotos, setPendingLocalPhotos] = useState<
    PendingLocalPhoto[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [demoSeeded, setDemoSeeded] = useState(
    Boolean(initialTrip?.journal?.length),
  );
  const [softNotice, setSoftNotice] = useState(false);
  /** Media / journal API soft-fail while composing (R2 / Neon absent). */
  const [composeSoftFail, setComposeSoftFail] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, startTransition] = useTransition();
  const composeRef = useRef<HTMLTextAreaElement | null>(null);
  const composeMountedRef = useRef(false);
  const dayTabsRef = useRef<HTMLDivElement | null>(null);
  const dayTabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [dayTabIndicator, setDayTabIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  const brandPrimary = locale === "zh-CN" ? brand.zh : brand.en;
  const brandSecondary = locale === "zh-CN" ? brand.en : brand.zh;

  useEffect(() => {
    setOnline(isBrowserOnline());
    const sync = () => setOnline(isBrowserOnline());
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Tip 015 — sliding day indicator on the journal list rail.
  useEffect(() => {
    if (!dayId) {
      setDayTabIndicator(null);
      return;
    }
    const INSET_X = 4;
    const measure = () => {
      const tab = dayTabRefs.current.get(dayId);
      if (!tab) return;
      const width = Math.max(tab.offsetWidth - INSET_X * 2, 0);
      setDayTabIndicator({
        left: tab.offsetLeft + INSET_X,
        width,
      });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const tab = dayTabRefs.current.get(dayId);
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tab?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      inline: "nearest",
      block: "nearest",
    });
    const rail = dayTabsRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" && rail
        ? new ResizeObserver(measure)
        : null;
    if (rail) ro?.observe(rail);
    window.addEventListener("resize", measure);
    rail?.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      rail?.removeEventListener("scroll", measure);
    };
  }, [dayId, days]);

  const selectDay = useCallback((nextId: string) => {
    setDayId(nextId);
    setStopId("");
  }, []);

  const onDayTabsKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!days.length || !dayId) return;
      const idx = days.findIndex((d) => d.id === dayId);
      if (idx < 0) return;
      let next = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        next = (idx + 1) % days.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        next = (idx - 1 + days.length) % days.length;
      } else if (e.key === "Home") {
        next = 0;
      } else if (e.key === "End") {
        next = days.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      const id = days[next]?.id;
      if (!id) return;
      selectDay(id);
      requestAnimationFrame(() => {
        dayTabRefs.current.get(id)?.focus();
      });
    },
    [dayId, days, selectDay],
  );

  // Day-tab compose remount → sheet-in, then land focus in the body.
  useEffect(() => {
    if (!dayId) return;
    if (!composeMountedRef.current) {
      composeMountedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      composeRef.current?.focus({ preventScroll: true });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [dayId]);

  const applySampleSeed = useCallback(
    (opts?: { soft?: boolean }) => {
      if (tripId !== "sample-kyoto") return false;
      const fixture = sampleKyotoFixture();
      setTrip(fixture.trip);
      setDays(fixture.days);
      setStops(fixture.stops);
      setLegs(fixture.legs);
      setEntries(fixture.journal);
      setDayId((prev) => prev ?? fixture.days[0]?.id ?? null);
      setDemoSeeded(true);
      setSoftNotice(Boolean(opts?.soft));
      setComposeSoftFail(true);
      setFromCache(false);
      setError(null);
      return true;
    },
    [tripId],
  );

  const loadJournal = useCallback(async () => {
    const data = await apiGet<{ entries: JournalEntry[] }>(
      `/v1/trips/${tripId}/journal`,
    );
    const next =
      tripId === "sample-kyoto" &&
      (!data.entries || data.entries.length === 0)
        ? sampleKyotoJournal()
        : data.entries;
    setEntries(next);
    setDemoSeeded(
      tripId === "sample-kyoto" &&
        (!data.entries || data.entries.length === 0),
    );
    setSoftNotice(false);
    setComposeSoftFail(false);
    setFromCache(false);
    return next;
  }, [tripId]);

  const loadTrip = useCallback(async () => {
    const data = await apiGet<TripPayload>(`/v1/trips/${tripId}`);
    setTrip(data.trip);
    setDays(data.days);
    setStops(data.stops);
    setLegs(data.legs ?? []);
    setDayId((prev) => prev ?? data.days[0]?.id ?? null);
    setFromCache(false);
    return data;
  }, [tripId]);

  const loadFromCache = useCallback(async () => {
    const cached = await readCachedTrip(tripId);
    if (!cached) return false;
    setTrip(cached.trip);
    setDays(cached.days);
    setStops(cached.stops);
    setLegs(cached.legs);
    setEntries(
      cached.journal.length > 0
        ? cached.journal
        : tripId === "sample-kyoto"
          ? sampleKyotoJournal()
          : [],
    );
    setDayId((prev) => prev ?? cached.days[0]?.id ?? null);
    setFromCache(true);
    setDemoSeeded(
      tripId === "sample-kyoto" && cached.journal.length === 0,
    );
    setInfo(t(locale, "offline.cachedRead"));
    return true;
  }, [locale, tripId]);

  useEffect(() => {
    startTransition(() => {
      void (async () => {
        try {
          if (!initialTrip) await loadTrip();
          else if (initialTrip.legs) setLegs(initialTrip.legs);
          await loadJournal();
          if (isBrowserOnline()) {
            try {
              await flushJournalQueue();
              await loadJournal();
            } catch {
              /* keep queue */
            }
          }
        } catch (e) {
          if (isPlannerNoiseError(e) || isOfflineTransportError(e)) {
            const ok = await loadFromCache();
            if (!ok && !applySampleSeed({ soft: true })) {
              setError(e instanceof Error ? e.message : "load_failed");
            } else if (ok && tripId === "sample-kyoto") {
              setSoftNotice(true);
              setComposeSoftFail(true);
            }
            return;
          }
          const ok = await loadFromCache();
          if (!ok && !applySampleSeed({ soft: true })) {
            setError(e instanceof Error ? e.message : "load_failed");
          } else if (ok) {
            setComposeSoftFail(true);
          }
        }
      })();
    });
  }, [
    applySampleSeed,
    initialTrip,
    loadFromCache,
    loadJournal,
    loadTrip,
    tripId,
  ]);

  useEffect(() => {
    const onOnline = () => {
      void (async () => {
        try {
          await flushJournalQueue();
          await loadTrip();
          await loadJournal();
          setInfo(null);
          setSoftNotice(false);
          setComposeSoftFail(false);
        } catch {
          /* stay on cache / seed */
        }
      })();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loadJournal, loadTrip]);

  const dayStops = useMemo(
    () => (dayId ? stopsForDay(stops, dayId) : []),
    [stops, dayId],
  );

  const visible = useMemo(() => {
    if (!dayId) return entries;
    return journalForDay(
      entries,
      dayId,
      dayStops.map((s) => s.id),
    );
  }, [entries, dayId, dayStops]);

  const activeDay = useMemo(
    () => days.find((d) => d.id === dayId) ?? null,
    [days, dayId],
  );

  const activeDayIndex = useMemo(() => {
    if (!dayId) return 0;
    const idx = days.findIndex((d) => d.id === dayId);
    return idx >= 0 ? idx : 0;
  }, [days, dayId]);

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setInfo(null);
    try {
      if (!isBrowserOnline()) {
        const locals: PendingLocalPhoto[] = [];
        for (const file of Array.from(files).slice(0, 6)) {
          const dataBase64 = await fileToBase64(file);
          const contentType = file.type || "image/jpeg";
          locals.push({
            id: crypto.randomUUID(),
            contentType,
            dataBase64,
            preview: `data:${contentType};base64,${dataBase64}`,
          });
        }
        setPendingLocalPhotos((prev) => [...prev, ...locals].slice(0, 8));
        return;
      }
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, 6)) {
        const key = await uploadJournalPhoto(file, tripId);
        uploaded.push(key);
      }
      setPendingMedia((prev) => [...prev, ...uploaded].slice(0, 8));
    } catch (e) {
      if (isOfflineTransportError(e) || isPlannerNoiseError(e)) {
        try {
          const locals: PendingLocalPhoto[] = [];
          for (const file of Array.from(files).slice(0, 6)) {
            const dataBase64 = await fileToBase64(file);
            const contentType = file.type || "image/jpeg";
            locals.push({
              id: crypto.randomUUID(),
              contentType,
              dataBase64,
              preview: `data:${contentType};base64,${dataBase64}`,
            });
          }
          setPendingLocalPhotos((prev) => [...prev, ...locals].slice(0, 8));
          setComposeSoftFail(true);
          setInfo(t(locale, "offline.savedLocal"));
          return;
        } catch {
          /* fall through */
        }
      }
      setError(e instanceof Error ? e.message : "upload_failed");
    }
  }

  async function saveEntry() {
    if (!body.trim() && pendingMedia.length === 0 && pendingLocalPhotos.length === 0) {
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    const payload = {
      dayId: dayId ?? undefined,
      stopId: stopId || undefined,
      body: body.trim(),
      media: pendingMedia,
      expectedVersion: trip?.version,
    };

    const finishLocal = async () => {
      const queued = await enqueueJournalCreate({
        tripId,
        body: payload.body,
        dayId: payload.dayId,
        stopId: payload.stopId,
        mediaKeys: pendingMedia,
        pendingPhotos: pendingLocalPhotos.map((p) => ({
          id: p.id,
          contentType: p.contentType,
          dataBase64: p.dataBase64,
        })),
        expectedVersion: trip?.version,
      });
      setEntries((prev) => [...prev, queued.localEntry]);
      setBody("");
      setPendingMedia([]);
      setPendingLocalPhotos([]);
      setStopId("");
      setInfo(t(locale, "offline.savedLocal"));
    };

    try {
      if (!isBrowserOnline() || softNotice) {
        await finishLocal();
        return;
      }
      await apiSend(`/v1/trips/${tripId}/journal`, "POST", payload);
      setBody("");
      setPendingMedia([]);
      setPendingLocalPhotos([]);
      setStopId("");
      await loadJournal();
      if (trip) {
        setTrip({ ...trip, version: trip.version + 1 });
      }
    } catch (e) {
      if (isOfflineTransportError(e) || isPlannerNoiseError(e)) {
        setComposeSoftFail(true);
        await finishLocal();
        return;
      }
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entryId: string) {
    const isSeedEntry = entryId.startsWith("journal-");
    try {
      if (!isBrowserOnline() || softNotice || isSeedEntry) {
        if (!isSeedEntry) {
          await enqueueJournalDelete({
            tripId,
            entryId,
            expectedVersion: trip?.version,
          });
        }
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setInfo(isSeedEntry ? null : t(locale, "offline.savedLocal"));
        return;
      }
      await apiSend(`/v1/trips/${tripId}/journal/${entryId}`, "DELETE", {
        expectedVersion: trip?.version,
      });
      await loadJournal();
    } catch (e) {
      if (isOfflineTransportError(e) || isPlannerNoiseError(e)) {
        if (!isSeedEntry) {
          await enqueueJournalDelete({
            tripId,
            entryId,
            expectedVersion: trip?.version,
          });
        }
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setInfo(t(locale, "offline.savedLocal"));
        return;
      }
      setError(e instanceof Error ? e.message : "delete_failed");
    }
  }

  if (!trip && pending) {
    return <JournalSkeleton />;
  }

  if (!trip) {
    return (
      <div className="px-6 py-20 text-ink-soft md:px-10">
        {error ?? t(locale, "planner.notFound")}
      </div>
    );
  }

  const previewMedia = [
    ...pendingMedia.map((url) => ({ key: url, src: resolveMediaUrl(url) })),
    ...pendingLocalPhotos.map((p) => ({ key: p.id, src: p.preview })),
  ];
  const stripMedia = previewMedia.slice(0, PHOTO_SLOT_MAX);
  const emptySlots = Math.max(0, PHOTO_SLOT_MAX - stripMedia.length);

  return (
    <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-4 md:px-8 md:pt-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-8 h-72 overflow-hidden"
      >
        <div
          className="absolute inset-0 animate-drift opacity-90"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 70% 55% at 78% 18%, rgba(47, 107, 255, 0.18), transparent 58%),
              radial-gradient(ellipse 50% 40% at 12% 0%, rgba(96, 165, 250, 0.14), transparent 52%),
              linear-gradient(180deg, #dbe8ff 0%, transparent 78%)
            `,
          }}
        />
        <div className="bp-topo absolute inset-0 opacity-45" />
      </div>

      <header className="animate-rise relative border-b border-[color:var(--bp-line)] pb-8">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-river">
          {brandSecondary}
          {fromCache ? ` · ${t(locale, "offline.offline")}` : ""}
        </p>
        <h1 className="mt-3 font-display text-[clamp(2.4rem,5.5vw,3.5rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-ink">
          {brandPrimary}
        </h1>
        <p className="mt-4 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-ink-soft">
          {t(locale, "journal.eyebrow")}
        </p>
        <p className="mt-2 max-w-xl font-display text-2xl font-semibold tracking-tight text-ink/90 md:text-3xl">
          {trip.title}
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base">
          {t(locale, "journal.support")}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          {demoSeeded || softNotice ? (
            <span className="rounded-bp-xs bg-river/12 px-2.5 py-1 font-semibold text-river-deep">
              {t(locale, "journal.demoBadge")}
            </span>
          ) : null}
          <span className="rounded-bp-xs bg-mist px-2.5 py-1 font-medium text-ink-soft">
            {online
              ? t(locale, "offline.online")
              : t(locale, "offline.offline")}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <OfflinePinControl
            tripId={tripId}
            locale={locale}
            trip={trip}
            days={days}
            stops={stops}
            legs={legs}
            journal={entries}
          />
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/trips/${tripId}`}
              className="rounded-bp-xs px-4 py-2 text-sm text-ink-soft underline-offset-4 bp-transition hover:text-river hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
            >
              {t(locale, "journal.backPlanner")}
            </Link>
            <Link
              href={`/trips/${tripId}/share`}
              className="rounded-bp bg-river px-4 py-2 text-sm font-semibold text-foam bp-transition hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {t(locale, "journal.toShare")}
            </Link>
          </div>
        </div>
      </header>

      {/* One composition: entry list + compose editor */}
      <div
        className="animate-rise relative mt-8 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam shadow-bp"
        style={{ animationDelay: "40ms" }}
      >
        <div
          ref={dayTabsRef}
          className="relative flex gap-0 overflow-x-auto border-b border-[color:var(--bp-line)] bg-paper/60 p-1"
          role="tablist"
          aria-label={t(locale, "journal.eyebrow")}
          onKeyDown={onDayTabsKeyDown}
        >
          {dayTabIndicator ? (
            <span
              aria-hidden
              className="animate-tab-indicator pointer-events-none absolute top-1 bottom-1 z-0 rounded-bp-sm bg-river shadow-bp-soft"
              style={{
                left: dayTabIndicator.left,
                width: dayTabIndicator.width,
              }}
            />
          ) : null}
          {days.map((day, i) => {
            const active = dayId === day.id;
            return (
              <button
                key={day.id}
                type="button"
                role="tab"
                id={`journal-day-tab-${day.id}`}
                aria-selected={active}
                aria-controls="journal-day-panel"
                tabIndex={active ? 0 : -1}
                ref={(el) => {
                  if (el) dayTabRefs.current.set(day.id, el);
                  else dayTabRefs.current.delete(day.id);
                }}
                onClick={() => selectDay(day.id)}
                className="bp-day-tab relative z-[1] shrink-0 rounded-bp-sm px-5 py-3 text-left"
              >
                <span
                  className={`block text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    active ? "opacity-90" : "opacity-70"
                  }`}
                >
                  {t(locale, "journal.daySection").replace(
                    "{n}",
                    String(i + 1),
                  )}
                </span>
                <span className="mt-0.5 block text-sm font-semibold tabular-nums">
                  {day.date}
                </span>
              </button>
            );
          })}
        </div>

        <JournalDayScrub
          locale={locale}
          stops={dayStops}
          selectedStopId={stopId || null}
          onSelectStop={setStopId}
        />

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.85fr)]">
          <section
            id="journal-day-panel"
            role="tabpanel"
            aria-labelledby={dayId ? `journal-day-tab-${dayId}` : undefined}
            className="min-w-0 space-y-0 px-5 py-6 md:px-7"
            aria-label={t(locale, "journal.listEyebrow")}
          >
            <div
              className="animate-sheet-in border-b border-[color:var(--bp-line)] pb-5"
              key={`list-head-${dayId ?? "all"}`}
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-river">
                {t(locale, "journal.listEyebrow")}
                {" · "}
                {t(locale, "journal.daySection").replace(
                  "{n}",
                  String(activeDayIndex + 1),
                )}
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
                {activeDay?.note ?? activeDay?.date ?? trip.title}
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                {activeDay?.date ? `${activeDay.date} · ` : ""}
                {t(locale, "journal.entryCount").replace(
                  "{n}",
                  String(visible.length),
                )}
              </p>
            </div>

            {visible.length === 0 && (
              <div
                key={`list-empty-${dayId ?? "all"}`}
                className="animate-sheet-in mt-6 max-w-lg py-8"
              >
                <p className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                  {t(locale, "journal.empty")}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  {t(locale, "journal.emptyHint")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    composeRef.current?.focus();
                    composeRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    });
                  }}
                  className="mt-7 rounded-bp bg-river px-5 py-3 text-sm font-semibold text-foam bp-transition hover:bg-river-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foam"
                >
                  {t(locale, "journal.emptyCta")}
                </button>
                <div className="mt-8 grid max-w-sm grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="aspect-[3/4] rounded-bp-sm bg-gradient-to-br from-river/15 via-mist to-foam"
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
            )}

            <ul
              key={`list-${dayId ?? "all"}`}
              className="divide-y divide-[color:var(--bp-line)]"
              role="list"
              aria-label={t(locale, "journal.listEyebrow")}
            >
              {visible.map((entry, index) => {
                const stop = stops.find((s) => s.id === entry.stopId);
                const scrubMatch = Boolean(stopId && entry.stopId === stopId);
                return (
                  <li key={entry.id}>
                    <article
                      className={`animate-entry-in group flex gap-4 py-7 first:pt-6 sm:gap-5 bp-transition ${
                        scrubMatch
                          ? "rounded-bp-sm bg-river/[0.04] ring-1 ring-river/25"
                          : ""
                      }`}
                      style={{ animationDelay: `${index * 55 + 40}ms` }}
                    >
                      <EntryIndexMark n={index + 1} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-river">
                            {stop?.place.name ??
                              days.find((d) => d.id === entry.dayId)?.note ??
                              t(locale, "journal.dayNote")}
                            {entry.id.startsWith("local-")
                              ? ` · ${t(locale, "offline.pending").replace("{n}", "1")}`
                              : ""}
                          </p>
                          <button
                            type="button"
                            onClick={() => void removeEntry(entry.id)}
                            className="shrink-0 rounded-bp-xs px-1.5 py-0.5 text-xs text-ink-soft/55 bp-transition hover:bg-river/8 hover:text-river focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
                          >
                            {t(locale, "journal.remove")}
                          </button>
                        </div>
                        {entry.body ? (
                          <p className="mt-2.5 font-display text-2xl leading-snug tracking-tight text-ink transition duration-bp-fast ease-bp-out group-hover:text-river md:text-3xl">
                            {entry.body}
                          </p>
                        ) : null}
                        {/* Entry photo strip — lead frame larger; empties quieter (#46). */}
                        {entry.media.length > 0 ? (
                          <div
                            className="mt-5"
                            role="group"
                            aria-label={t(locale, "journal.photoStrip")}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-river/80">
                                {t(locale, "journal.photoStrip")}
                              </p>
                              <span className="rounded-bp-xs bg-river/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-river-deep">
                                {t(locale, "journal.photoCount")
                                  .replace("{n}", String(entry.media.length))
                                  .replace(
                                    "{max}",
                                    String(
                                      Math.max(
                                        entry.media.length,
                                        PHOTO_SLOT_MAX,
                                      ),
                                    ),
                                  )}
                              </span>
                            </div>
                            <div className="mt-2.5 flex gap-2.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                              {entry.media.map((url, mediaIndex) => {
                                const lead = mediaIndex === 0;
                                return (
                                  <MediaFrame
                                    key={`${entry.id}-${mediaIndex}`}
                                    src={resolveMediaUrl(url)}
                                    alt=""
                                    label={t(
                                      locale,
                                      "journal.mediaPlaceholder",
                                    )}
                                    className={`animate-stop-select shrink-0 rounded-bp-sm object-cover transition duration-bp ease-bp-out-strong ${
                                      lead
                                        ? "h-36 w-[6.75rem] shadow-bp ring-1 ring-river/35 sm:h-40 sm:w-28"
                                        : "h-32 w-24 shadow-bp-soft ring-1 ring-[color:var(--bp-line)] sm:h-36 sm:w-[6.5rem]"
                                    }`}
                                    style={{
                                      animationDelay: `${mediaIndex * 45}ms`,
                                    }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div
                            className="mt-5"
                            role="group"
                            aria-label={t(locale, "journal.photoStrip")}
                          >
                            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
                              {t(locale, "journal.photoSlots")}
                            </p>
                            <div className="mt-2 flex gap-2">
                              {[0, 1].map((i) => (
                                <div
                                  key={i}
                                  className="aspect-[3/4] h-28 w-[5.25rem] rounded-bp-sm border border-dashed border-river/20 bg-gradient-to-br from-river/[0.06] via-mist/50 to-foam"
                                  aria-label={t(
                                    locale,
                                    "journal.mediaPlaceholder",
                                  )}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>

          <aside
            key={`compose-${dayId ?? "all"}`}
            className="animate-sheet-in flex flex-col border-t border-[color:var(--bp-line)] bg-paper/55 lg:sticky lg:top-4 lg:self-start lg:border-l lg:border-t-0"
            style={{ animationDelay: "80ms" }}
            aria-label={t(locale, "journal.compose")}
          >
            {/* Azure hierarchy rail — eyebrow · title · hint (#46) */}
            <header className="border-b border-[color:var(--bp-line)] bg-paper/70 px-5 py-4 shadow-[inset_3px_0_0_var(--bp-river)] md:px-6">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-river">
                  {t(locale, "journal.composeEyebrow")}
                </p>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
                  {t(locale, "journal.compose")}
                </h2>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {t(locale, "journal.composeHint")}
              </p>
            </header>

            <div className="flex flex-col p-5 md:p-6">
              <SoftFailNotice
                open={demoSeeded || softNotice || composeSoftFail}
                className="mb-5"
              >
                {softNotice && !online
                  ? t(locale, "journal.softOffline")
                  : composeSoftFail && !demoSeeded
                    ? t(locale, "journal.composeSoftFail")
                    : t(locale, "journal.demoNotice")}
              </SoftFailNotice>

              <label className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
                {t(locale, "journal.bindStop")}
                <select
                  value={stopId}
                  onChange={(e) => setStopId(e.target.value)}
                  className={`mt-2 w-full rounded-bp-sm px-3 py-2 text-sm text-ink ${COMPOSE_CONTROL}`}
                >
                  <option value="">{t(locale, "journal.dayOnly")}</option>
                  {dayStops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.place.name}
                    </option>
                  ))}
                </select>
              </label>

              <textarea
                ref={composeRef}
                id="journal-compose-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder={t(locale, "journal.placeholder")}
                className={`mt-4 w-full resize-none rounded-bp-sm px-3 py-3 font-display text-lg text-ink placeholder:text-ink-soft/50 ${COMPOSE_CONTROL}`}
              />

              {/* Media rail chrome — drop + strip hierarchy; SoftFailNotice above (#46). */}
              <section
                className="mt-4 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/85 shadow-bp-soft"
                aria-label={t(locale, "journal.photoSlots")}
              >
                <header className="flex items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/65 px-3.5 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
                    {t(locale, "journal.photoSlots")}
                  </p>
                  <span className="rounded-bp-xs bg-river/12 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-river-deep">
                    {t(locale, "journal.photoCount")
                      .replace("{n}", String(stripMedia.length))
                      .replace("{max}", String(PHOTO_SLOT_MAX))}
                  </span>
                </header>

                <label className="mx-3.5 mt-3 flex cursor-pointer flex-col items-start gap-1.5 rounded-bp-sm border border-dashed border-river/35 bg-mist/35 px-3.5 py-4 transition duration-bp ease-bp-out-strong hover:border-river/60 hover:bg-river/[0.04] focus-within:border-river focus-within:ring-2 focus-within:ring-focus/45">
                  <span className="text-sm font-semibold text-river">
                    {t(locale, "journal.addPhotos")}
                  </span>
                  <span className="text-xs leading-relaxed text-ink-soft">
                    {t(locale, "journal.uploadHint")}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => void onPickFiles(e.target.files)}
                  />
                </label>

                <div
                  className="flex gap-2 overflow-x-auto px-3.5 py-3 [scrollbar-width:thin]"
                  aria-label={t(locale, "journal.photoStrip")}
                >
                  {stripMedia.map((item, i) => (
                    <MediaFrame
                      key={item.key}
                      src={item.src}
                      alt=""
                      label={t(locale, "journal.mediaPlaceholder")}
                      className="animate-stop-select h-[5.5rem] w-16 shrink-0 rounded-bp-sm object-cover shadow-bp-soft ring-1 ring-river/35"
                      style={{ animationDelay: `${i * 40}ms` }}
                    />
                  ))}
                  {Array.from({ length: emptySlots }).map((_, i) => (
                    <div
                      key={`slot-${i}`}
                      className="flex h-[5.5rem] w-16 shrink-0 items-center justify-center rounded-bp-sm border border-dashed border-river/25 bg-gradient-to-br from-river/[0.08] via-mist/60 to-foam text-[11px] font-medium text-river/55 transition duration-bp-fast ease-bp-out"
                      aria-hidden
                    >
                      +
                    </div>
                  ))}
                </div>
              </section>

              {info && (
                <p className="mt-3 text-sm text-river" role="status">
                  {info}
                </p>
              )}
              {error && !isPlannerNoiseError(new Error(error)) && (
                <p className="mt-3 text-sm text-timber" role="alert">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={
                  saving ||
                  (!body.trim() &&
                    pendingMedia.length === 0 &&
                    pendingLocalPhotos.length === 0)
                }
                onClick={() => void saveEntry()}
                className={`mt-5 w-full ${COMPOSE_CTA}`}
              >
                {saving
                  ? t(locale, "journal.saving")
                  : t(locale, "journal.save")}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
