import type { Metadata } from "next";
import type { Day, Leg, Stop, Trip } from "@beaver/core";
import { getLocale } from "@/lib/locale";
import { apiBase } from "@/lib/api";
import { sampleKyotoFixture } from "@/lib/sample-kyoto";
import { TripPlanner } from "@/components/planner/trip-planner";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "sample-kyoto" ? "京都五日" : "Trip planner" };
}

async function loadTrip(id: string): Promise<{
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
} | null> {
  try {
    const res = await fetch(`${apiBase()}/v1/trips/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      if (id === "sample-kyoto") return sampleKyotoFixture();
      return null;
    }
    return (await res.json()) as {
      trip: Trip;
      days: Day[];
      stops: Stop[];
      legs: Leg[];
    };
  } catch {
    if (id === "sample-kyoto") return sampleKyotoFixture();
    return null;
  }
}

export default async function TripPlannerPage({ params }: Params) {
  const { id } = await params;
  const locale = await getLocale();
  const initial = await loadTrip(id);

  return <TripPlanner tripId={id} locale={locale} initial={initial} />;
}
