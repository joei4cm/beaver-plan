import type { Metadata } from "next";
import { getLocale } from "@/lib/locale";
import { TripsHome } from "@/components/trips/trips-home";

export const metadata: Metadata = {
  title: "Trips",
};

export default async function TripsPage() {
  const locale = await getLocale();
  return <TripsHome locale={locale} />;
}
