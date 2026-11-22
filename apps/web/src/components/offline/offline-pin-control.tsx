"use client";

import { useCallback, useEffect, useState } from "react";
import type { Day, JournalEntry, Leg, Stop, Trip } from "@beaver/core";
import type { Locale } from "@beaver/i18n";
import { t } from "@beaver/i18n";
import type { OfflinePinStatus } from "@beaver/offline";
import {
  SoftFailBadge,
  SoftFailNotice,
  SoftFailSupport,
  softFailMistWashClass,
  softFailRailClass,
} from "@/components/soft-fail-notice";
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

/** SoftFail kind under pin chrome — never paint timber / raw Error.message. */
type SoftFailKind = "pin" | "sync";

/**
 * Offline pin SoftFail helpers (BEA-448 after #323 timber fix):
 * azure Offline pin SoftFail rail · SoftFailBadge Soft pin/sync · SoftFailSupport ·
 * SoftFailNotice compact mist band · tip-011 mist-wash. SoftFail depth + helpers
 * kept. Soft copy never timber / Failed to fetch. No `/dev` SoftFail gallery.
 */
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
  const [softFail, setSoftFail] = useState<SoftFailKind | null>(null);
  // Avoid SSR/client navigator.onLine mismatch → Next.js "1 Issue" pill.
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getPinStatus(tripId);
      setStatus(next);
    } catch {
      setStatus(null);
    }
  }, [tripId]);

  useEffect(() => {
    setMounted(true);
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
    setSoftFail(null);
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
    } catch {
      // SoftFail pin chrome — soft i18n only; never timber / Failed to fetch.
      setSoftFail("pin");
    } finally {
      setBusy(false);
    }
  }

  async function onFlush() {
    setBusy(true);
    setSoftFail(null);
    try {
      await flushJournalQueue();
      await refresh();
    } catch {
      // SoftFail sync chrome — soft i18n only; never timber / Failed to fetch.
      setSoftFail("sync");
    } finally {
      setBusy(false);
    }
  }

  const pinned = status?.pinned ?? false;
  const pending = status?.pendingMutations ?? 0;
  const online = mounted
    ? (status?.online ?? isBrowserOnline())
    : true;

  const softOpen = Boolean(softFail);
  const pinSoftCopy = t(locale, "offline.pinSoftFail");
  const syncSoftCopy = t(locale, "offline.syncSoftFail");
  const softCopy = softFail === "sync" ? syncSoftCopy : pinSoftCopy;
  const softBadgeCopy =
    softFail === "sync"
      ? t(locale, "offline.syncSoftBadge")
      : t(locale, "offline.softBadge");
  const softSupportCopy = t(locale, "offline.softSupport");

  const pinControls = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void togglePin()}
        className={`rounded-bp-sm px-3 py-1.5 text-sm transition disabled:opacity-40 ${
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
      <span className="text-xs text-ink-soft/70">
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
  );

  return (
    <div
      className={
        softOpen
          ? "max-w-md overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft"
          : compact
            ? "inline-flex flex-col gap-1"
            : "flex flex-col gap-2"
      }
      aria-label={t(locale, "offline.pinRail")}
    >
      {/*
        SoftFailSupport residual (BEA-448 after #323): azure Offline pin SoftFail
        rail · SoftFailBadge Soft pin/sync · SoftFailSupport · SoftFailNotice
        compact mist band · tip-011 — SoftFail depth + helpers kept. Never timber.
      */}
      {softOpen ? (
        <header
          className={[
            "relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] px-3 py-2",
            softFailRailClass,
          ].join(" ")}
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-river">
              {t(locale, "offline.pinRail")}
            </span>
            <SoftFailSupport>{softSupportCopy}</SoftFailSupport>
          </div>
          <SoftFailBadge>{softBadgeCopy}</SoftFailBadge>
        </header>
      ) : null}

      {/* Compact SoftFail mist band under azure Offline pin SoftFail rail. */}
      <SoftFailNotice
        open={softOpen}
        compact
        className={softOpen ? "border-b border-[color:var(--bp-line)]" : "max-w-md text-xs"}
        fallback={softCopy}
      >
        {softCopy}
      </SoftFailNotice>

      <div
        className={
          softOpen
            ? `px-3 py-2.5 ${softFailMistWashClass}`
            : undefined
        }
      >
        {pinControls}
        {pinned && !compact ? (
          <p
            className={`max-w-md text-xs text-ink-soft/80 ${
              softOpen ? "mt-2" : "mt-0"
            }`}
          >
            {t(locale, "offline.statusHint")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
