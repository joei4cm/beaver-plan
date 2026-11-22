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
 * Offline pin / map-cache chrome — SoftFail depth kept (BEA-448 / BEA-450 /
 * #323) + wave 49 craft (BEA-474 / #343) + wave 52 residual (BEA-499): Lumen
 * eyebrow tracking · tip-011 header rise · status leading-relaxed. SoftFailBadge ·
 * SoftFailSupport · mist band unchanged. Craft: ?pinSoftFail=1 — SoftFail
 * depth without a pin/sync miss. Soft copy never timber / Failed to fetch.
 * No `/dev` gallery.
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
  /** Craft preview: /trips/…?pinSoftFail=1 — SoftFail depth under Offline pin. */
  const [pinSoftPreview] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        new URLSearchParams(window.location.search).get("pinSoftFail") === "1"
      );
    } catch {
      return false;
    }
  });
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

  /**
   * SoftFail depth kept (BEA-448 / BEA-450) — SoftFailBadge Soft pin/sync ·
   * SoftFailSupport · compact mist band · tip-011 wash. Craft: ?pinSoftFail=1.
   */
  const softOpen = pinSoftPreview || Boolean(softFail);
  const pinSoftCopy = t(locale, "offline.pinSoftFail");
  const syncSoftCopy = t(locale, "offline.syncSoftFail");
  const softCopy = softFail === "sync" ? syncSoftCopy : pinSoftCopy;
  const softBadgeCopy =
    softFail === "sync"
      ? t(locale, "offline.syncSoftBadge")
      : t(locale, "offline.softBadge");
  const softSupportCopy = t(locale, "offline.softSupport");

  const statusLabel = [
    online ? t(locale, "offline.online") : t(locale, "offline.offline"),
    pending > 0
      ? t(locale, "offline.pending").replace("{n}", String(pending))
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /** Always-on sheet for journal / SoftFail; compact stays chip-thin in export. */
  const sheetChrome = softOpen || !compact;

  const pinControls = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void togglePin()}
        className={`rounded-bp-sm px-3 py-1.5 text-sm font-semibold transition duration-bp ease-bp-out-strong active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-foam disabled:opacity-40 ${
          pinned
            ? "bg-river text-foam shadow-bp-soft"
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
      {compact ? (
        <span className="text-[11px] font-medium leading-relaxed tracking-wide text-ink-soft/75">
          {statusLabel}
        </span>
      ) : null}
      {pending > 0 && online ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onFlush()}
          className="text-xs font-medium text-river underline-offset-2 transition duration-bp-fast ease-bp-out hover:underline active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35 disabled:opacity-40"
        >
          {t(locale, "offline.syncNow")}
        </button>
      ) : null}
    </div>
  );

  return (
    <div
      className={
        sheetChrome
          ? "max-w-md overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft"
          : "inline-flex flex-col gap-1"
      }
      aria-label={t(locale, "offline.pinRail")}
    >
      {/*
        SoftFail kept (BEA-448 / BEA-450) + wave 49 (#343) + wave 52 (BEA-499):
        azure Offline pin rail · Lumen eyebrow · tip-011 rise · SoftFailBadge ·
        SoftFailSupport — craft ?pinSoftFail=1. Never timber / Failed to fetch.
      */}
      {sheetChrome ? (
        <header
          className={[
            "animate-rise relative flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--bp-line)] px-3 py-2",
            softOpen
              ? softFailRailClass
              : "bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]",
          ].join(" ")}
          style={{ animationDelay: "40ms" }}
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-river">
              {t(locale, "offline.pinRail")}
            </span>
            {softOpen ? (
              <SoftFailSupport>{softSupportCopy}</SoftFailSupport>
            ) : (
              <span className="text-[11px] font-medium leading-relaxed tracking-wide text-ink-soft/80">
                {statusLabel}
              </span>
            )}
          </div>
          {softOpen ? <SoftFailBadge>{softBadgeCopy}</SoftFailBadge> : null}
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
          sheetChrome
            ? `px-3 py-2.5 ${softOpen ? softFailMistWashClass : ""}`
            : undefined
        }
      >
        {pinControls}
        {pinned && !compact ? (
          <p
            className={`max-w-md text-xs leading-relaxed text-ink-soft/80 ${
              softOpen || sheetChrome ? "mt-2" : "mt-0"
            }`}
          >
            {t(locale, "offline.statusHint")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
