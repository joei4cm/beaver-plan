"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Day, JournalEntry, Stop, Trip } from "@beaver/core";
import { journalForDay, stopsForDay } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import { apiGet, apiSend } from "@/lib/api";
import { resolveMediaUrl, uploadJournalPhoto } from "@/lib/media-url";

type TripPayload = {
  trip: Trip;
  days: Day[];
  stops: Stop[];
};

type Props = {
  tripId: string;
  locale: Locale;
  initialTrip: TripPayload | null;
};

export function TripJournal({ tripId, locale, initialTrip }: Props) {
  const [trip, setTrip] = useState<Trip | null>(initialTrip?.trip ?? null);
  const [days, setDays] = useState<Day[]>(initialTrip?.days ?? []);
  const [stops, setStops] = useState<Stop[]>(initialTrip?.stops ?? []);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [dayId, setDayId] = useState<string | null>(
    initialTrip?.days[0]?.id ?? null,
  );
  const [stopId, setStopId] = useState<string | "">("");
  const [body, setBody] = useState("");
  const [pendingMedia, setPendingMedia] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadJournal = useCallback(async () => {
    const data = await apiGet<{ entries: JournalEntry[] }>(
      `/v1/trips/${tripId}/journal`,
    );
    setEntries(data.entries);
  }, [tripId]);

  const loadTrip = useCallback(async () => {
    const data = await apiGet<TripPayload>(`/v1/trips/${tripId}`);
    setTrip(data.trip);
    setDays(data.days);
    setStops(data.stops);
    setDayId((prev) => prev ?? data.days[0]?.id ?? null);
  }, [tripId]);

  useEffect(() => {
    startTransition(() => {
      void (async () => {
        try {
          if (!initialTrip) await loadTrip();
          await loadJournal();
        } catch (e) {
          setError(e instanceof Error ? e.message : "load_failed");
        }
      })();
    });
  }, [initialTrip, loadJournal, loadTrip]);

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
    const uploaded: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const key = await uploadJournalPhoto(file, tripId);
        uploaded.push(key);
      }
      setPendingMedia((prev) => [...prev, ...uploaded].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload_failed");
    }
  }

  async function saveEntry() {
    if (!body.trim() && pendingMedia.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/v1/trips/${tripId}/journal`, "POST", {
        dayId: dayId ?? undefined,
        stopId: stopId || undefined,
        body: body.trim(),
        media: pendingMedia,
      });
      setBody("");
      setPendingMedia([]);
      setStopId("");
      await loadJournal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entryId: string) {
    try {
      await apiSend(`/v1/trips/${tripId}/journal/${entryId}`, "DELETE");
      await loadJournal();
    } catch (e) {
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

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-4 md:px-8 md:pt-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-river/80">
            {t(locale, "journal.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-ink md:text-5xl">
            {trip.title}
          </h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            {t(locale, "journal.support")}
          </p>
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
            <p className="font-display text-2xl text-ink-soft/80">
              {t(locale, "journal.empty")}
            </p>
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

          {pendingMedia.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {pendingMedia.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={resolveMediaUrl(url)}
                  alt=""
                  className="h-16 w-12 object-cover"
                />
              ))}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-timber">{error}</p>}

          <button
            type="button"
            disabled={saving || (!body.trim() && pendingMedia.length === 0)}
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
