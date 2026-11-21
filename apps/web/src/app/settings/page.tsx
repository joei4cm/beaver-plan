import type { Metadata } from "next";
import { getLocale } from "@/lib/locale";
import { SettingsPanel } from "@/components/settings/settings-panel";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const locale = await getLocale();
  return <SettingsPanel locale={locale} />;
}
