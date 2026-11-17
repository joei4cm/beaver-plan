import Link from "next/link";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";
import { AuthControls } from "@/components/auth/auth-controls";

export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="relative z-20 flex items-center justify-between px-6 py-4 md:px-10 md:py-5">
      <Link href="/" className="group flex items-baseline gap-3">
        <span className="font-display text-xl font-bold tracking-tight text-ink md:text-2xl">
          {locale === "zh-CN" ? brand.zh : brand.en}
        </span>
        <span className="hidden text-[0.65rem] font-medium uppercase tracking-[0.22em] text-ink-soft/70 transition group-hover:text-river sm:inline">
          {locale === "zh-CN" ? brand.en : brand.zh}
        </span>
      </Link>
      <nav className="flex items-center gap-6 text-sm font-medium text-ink-soft">
        <Link
          href="/trips"
          className="transition duration-bp-fast ease-bp hover:text-river"
        >
          {t(locale, "nav.trips")}
        </Link>
        <Link
          href="/translate"
          className="transition duration-bp-fast ease-bp hover:text-river"
        >
          {t(locale, "nav.translate")}
        </Link>
        <AuthControls locale={locale} />
      </nav>
    </header>
  );
}
