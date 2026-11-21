"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
}: {
  src: string;
  alt: string;
  className?: string;
  label: string;
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
  const [online, setOnline] = useState(true);
  const [pending, startTransition] = useTransition();

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
            }
            return;
          }
          const ok = await loadFromCache();
          if (!ok && !applySampleSeed({ soft: true })) {
            setError(e instanceof Error ? e.message : "load_failed");
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
  const emptySlots = Math.max(0, 3 - previewMedia.length);

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

        {demoSeeded || softNotice ? (
          <SoftFailNotice className="mt-4">
            {softNotice && !online
              ? t(locale, "journal.softOffline")
              : t(locale, "journal.demoNotice")}
          </SoftFailNotice>
        ) : null}

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
              className="px-4 py-2 text-sm text-ink-soft underline-offset-4 transition duration-bp-fast ease-bp-out hover:text-river hover:underline"
            >
              {t(locale, "journal.backPlanner")}
            </Link>
            <Link
              href={`/trips/${tripId}/share`}
              className="rounded-bp bg-river px-4 py-2 text-sm font-semibold text-foam transition duration-bp ease-bp hover:bg-river-deep"
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
          className="flex gap-0 overflow-x-auto border-b border-[color:var(--bp-line)] bg-paper/60"
          role="tablist"
          aria-label={t(locale, "journal.eyebrow")}
        >
          {days.map((day, i) => (
            <button
              key={day.id}
              type="button"
              role="tab"
              aria-selected={dayId === day.id}
              onClick={() => {
                setDayId(day.id);
                setStopId("");
              }}
              className={`shrink-0 px-5 py-3.5 text-left transition duration-bp-fast ease-bp-out ${
                dayId === day.id
                  ? "bg-river text-foam"
                  : "text-ink-soft hover:bg-mist/70 hover:text-ink"
              }`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
                {t(locale, "journal.daySection").replace("{n}", String(i + 1))}
              </span>
              <span className="text-sm font-semibold">{day.date}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.85fr)]">
          <section
            className="min-w-0 space-y-0 px-5 py-6 md:px-7"
            aria-label={t(locale, "journal.eyebrow")}
          >
            <div
              className="animate-sheet-in border-b border-[color:var(--bp-line)] pb-5"
              key={dayId ?? "all"}
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-river">
                {t(locale, "journal.daySection").replace(
                  "{n}",
                  String(activeDayIndex + 1),
                )}
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
                {activeDay?.note ?? activeDay?.date ?? trip.title}
              </h2>
              {activeDay?.date ? (
                <p className="mt-2 text-sm text-ink-soft">{activeDay.date}</p>
              ) : null}
            </div>

            {visible.length === 0 && (
              <div className="animate-fade mt-6 rounded-bp border border-dashed border-river/30 bg-mist/25 px-6 py-14">
                <p className="font-display text-2xl font-semibold text-ink md:text-3xl">
                  {t(locale, "journal.empty")}
                </p>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
                  {t(locale, "journal.emptyHint")}
                </p>
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

            <div className="divide-y divide-[color:var(--bp-line)]">
              {visible.map((entry, index) => {
                const stop = stops.find((s) => s.id === entry.stopId);
                return (
                  <article
                    key={entry.id}
                    className="animate-entry-in py-7 first:pt-6"
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-river">
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
                        className="text-xs text-ink-soft/60 transition duration-bp-fast ease-bp-out hover:text-timber"
                      >
                        {t(locale, "journal.remove")}
                      </button>
                    </div>
                    {entry.body ? (
                      <p className="mt-3 font-display text-2xl leading-snug tracking-tight text-ink md:text-3xl">
                        {entry.body}
                      </p>
                    ) : null}
                    {entry.media.length > 0 ? (
                      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
                        {entry.media.map((url, mediaIndex) => (
                          <MediaFrame
                            key={`${entry.id}-${mediaIndex}`}
                            src={resolveMediaUrl(url)}
                            alt=""
                            label={t(locale, "journal.mediaPlaceholder")}
                            className="aspect-[3/4] w-full rounded-bp-sm object-cover ring-1 ring-[color:var(--bp-line)]"
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-5 grid max-w-xs grid-cols-3 gap-2">
                        {[0, 1].map((i) => (
                          <div
                            key={i}
                            className="aspect-[3/4] rounded-bp-sm border border-dashed border-river/25 bg-mist/40"
                            aria-label={t(locale, "journal.mediaPlaceholder")}
                          />
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <aside
            className="animate-sheet-in flex flex-col border-t border-[color:var(--bp-line)] bg-paper/55 p-5 md:p-6 lg:border-l lg:border-t-0"
            style={{ animationDelay: "100ms" }}
            aria-label={t(locale, "journal.compose")}
          >
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
              {t(locale, "journal.compose")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {t(locale, "journal.composeHint")}
            </p>

            <label className="mt-5 block text-xs font-medium uppercase tracking-wider text-ink-soft">
              {t(locale, "journal.bindStop")}
              <select
                value={stopId}
                onChange={(e) => setStopId(e.target.value)}
                className="mt-2 w-full rounded-bp-sm border border-[color:var(--bp-line)] bg-foam px-3 py-2 text-sm text-ink transition duration-bp-fast ease-bp-out focus:border-river focus:outline-none focus:ring-2 focus:ring-focus/40"
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
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={t(locale, "journal.placeholder")}
              className="mt-4 w-full resize-none rounded-bp-sm border border-[color:var(--bp-line)] bg-foam px-3 py-3 font-display text-lg text-ink placeholder:text-ink-soft/50 transition duration-bp-fast ease-bp-out focus:border-river focus:outline-none focus:ring-2 focus:ring-focus/40"
            />

            <label className="mt-4 flex cursor-pointer flex-col items-start gap-2 rounded-bp-sm border border-dashed border-river/35 bg-mist/40 px-4 py-5 transition duration-bp-fast ease-bp-out hover:border-river/60 hover:bg-river/[0.04]">
              <span className="text-sm font-semibold text-river">
                {t(locale, "journal.addPhotos")}
              </span>
              <span className="text-xs text-ink-soft">
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

            <div className="mt-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                {t(locale, "journal.photoSlots")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {previewMedia.map((item) => (
                  <MediaFrame
                    key={item.key}
                    src={item.src}
                    alt=""
                    label={t(locale, "journal.mediaPlaceholder")}
                    className="h-20 w-14 rounded-bp-sm object-cover ring-1 ring-[color:var(--bp-line)]"
                  />
                ))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div
                    key={`slot-${i}`}
                    className="flex h-20 w-14 items-center justify-center rounded-bp-sm border border-dashed border-river/30 bg-gradient-to-br from-river/10 to-mist/60 text-[10px] font-medium text-river/70"
                    aria-hidden
                  >
                    +
                  </div>
                ))}
              </div>
            </div>

            {info && <p className="mt-3 text-sm text-river">{info}</p>}
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
              className="mt-5 w-full rounded-bp bg-river px-4 py-3 text-sm font-semibold text-foam transition duration-bp ease-bp hover:bg-river-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? t(locale, "journal.saving") : t(locale, "journal.save")}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
