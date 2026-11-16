import { cookies } from "next/headers";
import { defaultLocale, isLocale, type Locale } from "@beaver/i18n";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const raw = jar.get("bp_locale")?.value;
  if (raw && isLocale(raw)) return raw;
  return defaultLocale;
}
