import Link from "next/link";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";
import { AuthControls } from "@/components/auth/auth-controls";

export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
      <Link href="/" className="group flex items-baseline gap-2">
        <span className="font-display text-xl tracking-tight text-ink md:text-2xl">
          {locale === "zh-CN" ? brand.zh : brand.en}
        </span>
        <span className="hidden text-sm text-ink-soft/70 transition group-hover:text-river sm:inline">
          {locale === "zh-CN" ? brand.en : brand.zh}
        </span>
      </Link>
      <nav className="flex items-center gap-5 text-sm text-ink-soft">
        <Link href="/trips" className="transition hover:text-river">
          {t(locale, "nav.trips")}
        </Link>
        <Link href="/translate" className="transition hover:text-river">
          {t(locale, "nav.translate")}
        </Link>
        <AuthControls locale={locale} />
      </nav>
    </header>
  );
}
