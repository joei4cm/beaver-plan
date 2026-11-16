import type { Metadata } from "next";
import { LiveAssist } from "@/components/translate/live-assist";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: "Live translation",
};

export default async function TranslatePage() {
  const locale = await getLocale();
  return <LiveAssist locale={locale} />;
}
