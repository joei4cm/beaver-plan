import Link from "next/link";
import { brand } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { getLocale } from "@/lib/locale";

export default async function HomePage() {
  const locale = await getLocale();
  const brandName = locale === "zh-CN" ? brand.zh : brand.en;
  const brandAlt = locale === "zh-CN" ? brand.en : brand.zh;

  return (
    <section className="relative min-h-[calc(100vh-4.5rem)] overflow-hidden">
      {/* Full-bleed atmospheric plane */}
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: `
            linear-gradient(120deg, rgba(15, 67, 57, 0.55) 0%, rgba(20, 32, 28, 0.25) 45%, transparent 70%),
            radial-gradient(ellipse 80% 70% at 70% 40%, rgba(216, 226, 220, 0.35), transparent 60%),
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231f6b5c' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[55%] bg-gradient-to-l from-river-deep/40 via-river/20 to-transparent"
      />

      <div className="mx-auto flex max-w-6xl flex-col justify-center px-6 pb-20 pt-10 md:min-h-[calc(100vh-5rem)] md:px-10 md:pb-28 md:pt-6">
        <p className="animate-fade text-sm uppercase tracking-[0.22em] text-river-deep/80">
          {brandAlt}
        </p>
        <h1 className="animate-rise mt-4 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight text-ink md:text-7xl">
          {brandName}
        </h1>
        <p
          className="animate-rise mt-6 max-w-xl text-lg leading-relaxed text-ink-soft md:text-xl"
          style={{ animationDelay: "80ms" }}
        >
          {t(locale, "landing.support")}
        </p>
        <div
          className="animate-rise mt-10 flex flex-wrap items-center gap-4"
          style={{ animationDelay: "140ms" }}
        >
          <Link
            href="/trips"
            className="rounded-md bg-river px-5 py-3 text-sm font-medium text-foam transition duration-300 ease-bp hover:bg-river-deep"
          >
            {t(locale, "cta.startPlanning")}
          </Link>
          <Link
            href="/translate"
            className="rounded-md border border-[color:var(--bp-line)] bg-foam/50 px-5 py-3 text-sm text-ink-soft backdrop-blur-sm transition hover:border-river/40 hover:text-river"
          >
            {t(locale, "nav.translate")}
          </Link>
        </div>
      </div>
    </section>
  );
}
