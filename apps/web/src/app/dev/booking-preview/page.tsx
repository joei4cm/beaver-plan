"use client";

/**
 * Local-only preview for OTA booking panel UX (no Neon required).
 * Not linked from nav — leave for engineers; soft-fails when API absent.
 */
import { useMemo, useState } from "react";
import type { Stop, Trip } from "@beaver/core";
import { BookingPanel } from "@/components/planner/booking-panel";
import { SoftFailNotice } from "@/components/soft-fail-notice";

const trip: Trip = {
  id: "preview",
  title: "Kyoto spring",
  destination: "Kyoto",
  startDate: "2026-04-10",
  endDate: "2026-04-12",
  timezone: "Asia/Tokyo",
  locale: "zh-CN",
  mapEngine: "auto",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const initialStop: Stop = {
  id: "stop-kiyomizu",
  dayId: "day-1",
  order: 0,
  place: {
    engine: "google",
    enginePlaceId: "demo-kiyomizu",
    name: "清水寺",
    address: "Kyoto",
    lat: 34.9949,
    lng: 135.785,
  },
  photos: [],
  bookingLinks: [
    {
      kind: "ticket",
      url: "https://example.com/demo/tickets/kiyomizu-night",
      providerLabel: "DemoTickets",
    },
  ],
};

export default function BookingPreviewPage() {
  const [stop, setStop] = useState(StopState(initialStop));
  const [version, setVersion] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const liveTrip = useMemo(() => ({ ...trip, version }), [version]);

  return (
    <main className="relative mx-auto max-w-xl px-4 py-10">
      <div
        className="pointer-events-none absolute inset-x-0 -top-6 h-48 bg-[radial-gradient(ellipse_at_20%_0%,rgba(47,107,255,0.14),transparent_55%)]"
        aria-hidden
      />
      <p className="relative text-[0.65rem] font-semibold uppercase tracking-[0.26em] text-river">
        海狸旅行 · Booking
      </p>
      <h1 className="relative mt-2 font-display text-4xl tracking-tight text-ink">
        预订
      </h1>
      <p className="relative mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
        Search → results → azure open CTA. SoftFailNotice when the booking API
        is offline; no checkout in Beaver Plan.
      </p>
      <div className="relative mt-8 animate-rise">
        <BookingPanel
          tripId={liveTrip.id}
          locale="zh-CN"
          trip={liveTrip}
          stop={stop}
          destinationHint="Kyoto"
          defaultOpen
          onSaved={async () => {
            setVersion((v) => v + 1);
          }}
          onError={(message) => {
            if (!message) {
              setError(null);
              setSoftNotice(null);
              return;
            }
            setError(message);
            setSoftNotice(null);
          }}
        />
      </div>
      <SoftFailNotice open={Boolean(softNotice)} className="mt-4">
        {softNotice ?? ""}
      </SoftFailNotice>
      {error && (
        <p className="mt-4 text-sm text-timber" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="mt-4 text-xs text-ink-soft underline underline-offset-4 transition hover:text-river"
        onClick={() => {
          setStop(StopState(initialStop));
          setError(null);
          setSoftNotice(null);
        }}
      >
        Reset stop
      </button>
    </main>
  );
}

function StopState(s: Stop): Stop {
  return {
    ...s,
    bookingLinks: s.bookingLinks.map((b) => ({ ...b })),
  };
}
