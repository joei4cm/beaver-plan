import type { Metadata } from "next";
import { getLocale } from "@/lib/locale";
import { CreateTripForm } from "@/components/trips/create-trip-form";

export const metadata: Metadata = {
  title: "New trip",
};

type Props = {
  searchParams: Promise<{ template?: string }>;
};

export default async function NewTripPage({ searchParams }: Props) {
  const locale = await getLocale();
  const params = await searchParams;
  return (
    <CreateTripForm
      locale={locale}
      initialTemplateId={params.template}
    />
  );
}
