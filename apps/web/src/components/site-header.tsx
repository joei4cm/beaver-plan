import Link from "next/link";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";

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
        <span
          className="rounded-md border border-[color:var(--bp-line)] bg-foam/70 px-3 py-1.5 text-ink-soft/80"
          title="Clerk — set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
        >
          {t(locale, "nav.signIn")}
        </span>
      </nav>
    </header>
  );
}
