import Link from "next/link";
import { brand } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { getLocale } from "@/lib/locale";

export default async function HomePage() {
  const locale = await getLocale();
  const brandName = locale === "zh-CN" ? brand.zh : brand.en;
  const brandAlt = locale === "zh-CN" ? brand.en : brand.zh;
  const tagline = locale === "zh-CN" ? brand.taglineZh : brand.taglineEn;

  return (
    <section className="relative min-h-[calc(100vh-4.5rem)] overflow-hidden">
      {/* Full-bleed atmospheric plane */}
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: `
            linear-gradient(125deg, rgba(12, 58, 50, 0.62) 0%, rgba(16, 26, 23, 0.28) 42%, transparent 72%),
            radial-gradient(ellipse 85% 70% at 72% 38%, rgba(213, 224, 217, 0.28), transparent 58%),
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231a6557' fill-opacity='0.055'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[58%] bg-gradient-to-l from-river-deep/45 via-river/18 to-transparent"
      />

      <div className="mx-auto flex max-w-6xl flex-col justify-center px-6 pb-20 pt-10 md:min-h-[calc(100vh-5rem)] md:px-10 md:pb-28 md:pt-6">
        <p className="animate-fade text-sm uppercase tracking-[0.26em] text-river-deep/75">
          {brandAlt}
        </p>
        <h1 className="animate-rise mt-5 max-w-3xl font-display text-5xl leading-[1.02] tracking-tight text-ink md:text-7xl">
          {brandName}
        </h1>
        <p
          className="animate-rise mt-3 max-w-xl font-display text-xl text-river-deep/90 md:text-2xl"
          style={{ animationDelay: "60ms" }}
        >
          {tagline}
        </p>
        <p
          className="animate-rise mt-5 max-w-xl text-base leading-relaxed text-ink-soft md:text-lg"
          style={{ animationDelay: "110ms" }}
        >
          {t(locale, "landing.support")}
        </p>
        <div
          className="animate-rise mt-10 flex flex-wrap items-center gap-4"
          style={{ animationDelay: "160ms" }}
        >
          <Link
            href="/trips"
            className="rounded-bp bg-river px-5 py-3 text-sm font-medium text-foam shadow-bp-soft transition duration-bp ease-bp hover:bg-river-deep"
          >
            {t(locale, "cta.startPlanning")}
          </Link>
          <Link
            href="/translate"
            className="rounded-bp border border-[color:var(--bp-line)] bg-foam/55 px-5 py-3 text-sm text-ink-soft backdrop-blur-sm transition duration-bp-fast ease-bp hover:border-river/40 hover:text-river"
          >
            {t(locale, "nav.translate")}
          </Link>
        </div>
      </div>
    </section>
  );
}
