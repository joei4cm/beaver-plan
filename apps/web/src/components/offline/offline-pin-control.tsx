"use client";

import { useCallback, useEffect, useState } from "react";
import type { Day, JournalEntry, Leg, Stop, Trip } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import type { OfflinePinStatus } from "@beaver/offline";
import {
  flushJournalQueue,
  getPinStatus,
  isBrowserOnline,
  pinTripForOffline,
  unpinTripOffline,
} from "@/lib/offline/trip-offline";

type Props = {
  tripId: string;
  locale: Locale;
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs?: Leg[];
  journal?: JournalEntry[];
  /** Compact chip for header rows. */
  compact?: boolean;
};

export function OfflinePinControl({
  tripId,
  locale,
  trip,
  days,
  stops,
  legs = [],
  journal = [],
  compact = false,
}: Props) {
  const [status, setStatus] = useState<OfflinePinStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getPinStatus(tripId);
      setStatus(next);
    } catch {
      setStatus(null);
    }
  }, [tripId]);

  useEffect(() => {
    void refresh();
    const onNet = () => {
      void (async () => {
        if (isBrowserOnline()) {
          try {
            await flushJournalQueue();
          } catch {
            /* keep queued */
          }
        }
        await refresh();
      })();
    };
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    return () => {
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    };
  }, [refresh]);

  async function togglePin() {
    setBusy(true);
    setError(null);
    try {
      if (status?.pinned) {
        await unpinTripOffline(tripId);
      } else {
        await pinTripForOffline({
          trip,
          days,
          stops,
          legs,
          journal,
        });
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "pin_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFlush() {
    setBusy(true);
    setError(null);
    try {
      await flushJournalQueue();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "flush_failed");
    } finally {
      setBusy(false);
    }
  }

  const pinned = status?.pinned ?? false;
  const pending = status?.pendingMutations ?? 0;
  const online = status?.online ?? isBrowserOnline();

  return (
    <div className={compact ? "inline-flex flex-col gap-1" : "flex flex-col gap-2"}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void togglePin()}
          className={`rounded-md px-3 py-1.5 text-sm transition disabled:opacity-40 ${
            pinned
              ? "bg-river text-foam"
              : "border border-[color:var(--bp-line)] bg-foam/60 text-ink-soft hover:border-river/40 hover:text-river"
          }`}
          title={t(locale, "offline.pinHint")}
        >
          {busy
            ? t(locale, "offline.working")
            : pinned
              ? t(locale, "offline.pinned")
              : t(locale, "offline.pin")}
        </button>
        <span
          className={`text-xs ${
            online ? "text-ink-soft/70" : "text-timber"
          }`}
        >
          {online ? t(locale, "offline.online") : t(locale, "offline.offline")}
          {pending > 0
            ? ` · ${t(locale, "offline.pending").replace("{n}", String(pending))}`
            : ""}
        </span>
        {pending > 0 && online ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onFlush()}
            className="text-xs text-river underline-offset-2 hover:underline disabled:opacity-40"
          >
            {t(locale, "offline.syncNow")}
          </button>
        ) : null}
      </div>
      {pinned && !compact ? (
        <p className="max-w-md text-xs text-ink-soft/80">
          {t(locale, "offline.statusHint")}
        </p>
      ) : null}
      {error ? <p className="text-xs text-timber">{error}</p> : null}
    </div>
  );
}
