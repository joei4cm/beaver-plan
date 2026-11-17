"use client";

/**
 * Local-only preview for OTA booking panel UX (no Neon required).
 * Not linked from nav — remove or leave for engineers; gated by host check.
 */
import { useMemo, useState } from "react";
import type { Stop, Trip } from "@beaver/core";
import { BookingPanel } from "@/components/planner/booking-panel";

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
  const liveTrip = useMemo(
    () => ({ ...trip, version }),
    [version],
  );

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-xs uppercase tracking-[0.18em] text-river/80">
        Dev preview
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink">预订 panel</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Uses live <code className="text-river">/v1/booking/*</code> on the BFF.
        Save calls the trip stop PATCH (needs Neon) — search works without DB.
      </p>
      <div className="mt-8">
        <BookingPanel
          tripId={liveTrip.id}
          locale="zh-CN"
          trip={liveTrip}
          stop={stop}
          destinationHint="Kyoto"
          onSaved={async () => {
            setVersion((v) => v + 1);
          }}
          onError={(message) => setError(message || null)}
        />
      </div>
      {error && (
        <p className="mt-4 text-sm text-timber" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="mt-4 text-xs text-ink-soft underline"
        onClick={() => setStop(StopState(initialStop))}
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
