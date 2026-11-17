"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Day, JournalEntry, Leg, Stop, Trip } from "@beaver/core";
import { journalForDay, stopsForDay } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { OfflinePinControl } from "@/components/offline/offline-pin-control";
import { apiGet, apiSend } from "@/lib/api";
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

export function TripJournal({ tripId, locale, initialTrip }: Props) {
  const [trip, setTrip] = useState<Trip | null>(initialTrip?.trip ?? null);
  const [days, setDays] = useState<Day[]>(initialTrip?.days ?? []);
  const [stops, setStops] = useState<Stop[]>(initialTrip?.stops ?? []);
  const [legs, setLegs] = useState<Leg[]>(initialTrip?.legs ?? []);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
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
  const [pending, startTransition] = useTransition();

  const loadJournal = useCallback(async () => {
    const data = await apiGet<{ entries: JournalEntry[] }>(
      `/v1/trips/${tripId}/journal`,
    );
    setEntries(data.entries);
    setFromCache(false);
    return data.entries;
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
    setEntries(cached.journal);
    setDayId((prev) => prev ?? cached.days[0]?.id ?? null);
    setFromCache(true);
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
          const ok = await loadFromCache();
          if (!ok) {
            setError(e instanceof Error ? e.message : "load_failed");
          }
        }
      })();
    });
  }, [initialTrip, loadFromCache, loadJournal, loadTrip]);

  useEffect(() => {
    const onOnline = () => {
      void (async () => {
        try {
          await flushJournalQueue();
          await loadTrip();
          await loadJournal();
          setInfo(null);
        } catch {
          /* stay on cache */
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
      if (isOfflineTransportError(e)) {
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
      if (!isBrowserOnline()) {
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
      if (isOfflineTransportError(e)) {
        await finishLocal();
        return;
      }
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entryId: string) {
    try {
      if (!isBrowserOnline()) {
        await enqueueJournalDelete({
          tripId,
          entryId,
          expectedVersion: trip?.version,
        });
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setInfo(t(locale, "offline.savedLocal"));
        return;
      }
      await apiSend(`/v1/trips/${tripId}/journal/${entryId}`, "DELETE", {
        expectedVersion: trip?.version,
      });
      await loadJournal();
    } catch (e) {
      if (isOfflineTransportError(e)) {
        await enqueueJournalDelete({
          tripId,
          entryId,
          expectedVersion: trip?.version,
        });
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setInfo(t(locale, "offline.savedLocal"));
        return;
      }
      setError(e instanceof Error ? e.message : "delete_failed");
    }
  }

  if (!trip && pending) {
    return (
      <div className="px-6 py-20 text-ink-soft md:px-10">
        {t(locale, "journal.loading")}
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

  const previewMedia = [
    ...pendingMedia.map((url) => ({ key: url, src: resolveMediaUrl(url) })),
    ...pendingLocalPhotos.map((p) => ({ key: p.id, src: p.preview })),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-4 md:px-8 md:pt-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-river/80">
            {t(locale, "journal.eyebrow")}
            {fromCache ? ` · ${t(locale, "offline.offline")}` : ""}
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-ink md:text-5xl">
            {trip.title}
          </h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            {t(locale, "journal.support")}
          </p>
          <div className="mt-4">
            <OfflinePinControl
              tripId={tripId}
              locale={locale}
              trip={trip}
              days={days}
              stops={stops}
              legs={legs}
              journal={entries}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/trips/${tripId}`}
            className="rounded-md border border-[color:var(--bp-line)] bg-foam/60 px-4 py-2 text-sm text-ink-soft transition hover:border-river/40 hover:text-river"
          >
            {t(locale, "journal.backPlanner")}
          </Link>
          <Link
            href={`/trips/${tripId}/share`}
            className="rounded-md bg-river px-4 py-2 text-sm font-medium text-foam transition hover:bg-river-deep"
          >
            {t(locale, "journal.toShare")}
          </Link>
        </div>
      </header>

      <div className="mt-8 flex gap-2 overflow-x-auto pb-1">
        {days.map((day, i) => (
          <button
            key={day.id}
            type="button"
            onClick={() => {
              setDayId(day.id);
              setStopId("");
            }}
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

      <section
        className="animate-fade mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]"
        style={{ animationDelay: "80ms" }}
      >
        <div className="space-y-8">
          {visible.length === 0 && (
            <div className="animate-fade rounded-bp-lg border border-dashed border-river/25 bg-foam/35 px-6 py-14">
              <p className="font-display text-2xl text-ink md:text-3xl">
                {t(locale, "journal.empty")}
              </p>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
                {t(locale, "journal.emptyHint")}
              </p>
            </div>
          )}
          {visible.map((entry, index) => {
            const stop = stops.find((s) => s.id === entry.stopId);
            return (
              <article
                key={entry.id}
                className="animate-rise border-b border-[color:var(--bp-line)] pb-8"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-timber">
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
                    className="text-xs text-ink-soft/60 transition hover:text-timber"
                  >
                    {t(locale, "journal.remove")}
                  </button>
                </div>
                {entry.body ? (
                  <p className="mt-3 font-display text-2xl leading-snug text-ink md:text-3xl">
                    {entry.body}
                  </p>
                ) : null}
                {entry.media.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
                    {entry.media.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={resolveMediaUrl(url)}
                        alt=""
                        className="aspect-[3/4] w-full object-cover"
                      />
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <aside className="h-fit rounded-[20px] border border-[color:var(--bp-line)] bg-foam/55 p-5 backdrop-blur-sm lg:sticky lg:top-6">
          <h2 className="font-display text-2xl text-ink">
            {t(locale, "journal.compose")}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {t(locale, "journal.composeHint")}
          </p>

          <label className="mt-5 block text-xs uppercase tracking-wider text-ink-soft">
            {t(locale, "journal.bindStop")}
            <select
              value={stopId}
              onChange={(e) => setStopId(e.target.value)}
              className="mt-2 w-full rounded-md border border-[color:var(--bp-line)] bg-paper px-3 py-2 text-sm text-ink"
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
            className="mt-4 w-full resize-none rounded-md border border-[color:var(--bp-line)] bg-paper px-3 py-3 font-display text-lg text-ink placeholder:text-ink-soft/50 focus:border-river focus:outline-none"
          />

          <label className="mt-4 flex cursor-pointer flex-col items-start gap-2 rounded-md border border-dashed border-river/35 bg-mist/30 px-4 py-5 transition hover:border-river/60">
            <span className="text-sm font-medium text-river">
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

          {previewMedia.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {previewMedia.map((item) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={item.key}
                  src={item.src}
                  alt=""
                  className="h-16 w-12 object-cover"
                />
              ))}
            </div>
          )}

          {info && <p className="mt-3 text-sm text-river">{info}</p>}
          {error && <p className="mt-3 text-sm text-timber">{error}</p>}

          <button
            type="button"
            disabled={
              saving ||
              (!body.trim() &&
                pendingMedia.length === 0 &&
                pendingLocalPhotos.length === 0)
            }
            onClick={() => void saveEntry()}
            className="mt-5 w-full rounded-md bg-timber px-4 py-3 text-sm font-medium text-foam transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? t(locale, "journal.saving") : t(locale, "journal.save")}
          </button>
        </aside>
      </section>
    </div>
  );
}
