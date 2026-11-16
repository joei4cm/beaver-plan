import type { Metadata } from "next";
import type { Day, Stop, Trip } from "@beaver/core";
import { getLocale } from "@/lib/locale";
import { apiBase } from "@/lib/api";
import { TripJournal } from "@/components/journal/trip-journal";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return {
    title: id === "sample-kyoto" ? "京都日记" : "Trip journal",
  };
}

async function loadTrip(id: string): Promise<{
  trip: Trip;
  days: Day[];
  stops: Stop[];
} | null> {
  try {
    const res = await fetch(`${apiBase()}/v1/trips/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as { trip: Trip; days: Day[]; stops: Stop[] };
  } catch {
    return null;
  }
}

export default async function JournalPage({ params }: Params) {
  const { id } = await params;
  const locale = await getLocale();
  const initial = await loadTrip(id);

  return (
    <TripJournal tripId={id} locale={locale} initialTrip={initial} />
  );
}
