import Link from "next/link";
import { brand } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { getLocale } from "@/lib/locale";

export default async function HomePage() {
  const locale = await getLocale();
  const brandPrimary = locale === "zh-CN" ? brand.zh : brand.en;
  const brandSecondary = locale === "zh-CN" ? brand.en : brand.zh;
  const tagline = locale === "zh-CN" ? brand.taglineZh : brand.taglineEn;

  return (
    <section className="relative min-h-[calc(100vh-4.25rem)] overflow-hidden">
      {/* Full-bleed atlas hero plane */}
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: `
            linear-gradient(115deg, rgba(6, 74, 79, 0.92) 0%, rgba(11, 20, 32, 0.55) 38%, rgba(11, 20, 32, 0.18) 68%, transparent 88%),
            radial-gradient(ellipse 90% 70% at 78% 42%, rgba(25, 168, 161, 0.28), transparent 55%),
            radial-gradient(ellipse 50% 40% at 20% 80%, rgba(232, 78, 47, 0.18), transparent 50%),
            linear-gradient(160deg, #064a4f 0%, #0b1420 55%, #1a2a38 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="bp-topo pointer-events-none absolute inset-0 -z-10 opacity-40 mix-blend-soft-light"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[62%] bg-gradient-to-l from-river/25 via-transparent to-transparent"
      />

      <div className="mx-auto flex max-w-6xl flex-col justify-end px-6 pb-16 pt-16 md:min-h-[calc(100vh-4.25rem)] md:justify-center md:px-10 md:pb-28 md:pt-8">
        <div className="max-w-3xl text-foam">
          <p className="animate-fade text-[0.7rem] font-medium uppercase tracking-[0.34em] text-foam/55 md:text-xs">
            {brandSecondary}
          </p>
          <h1 className="animate-rise mt-4 font-display text-[clamp(3.25rem,9vw,6.25rem)] font-extrabold leading-[0.92] tracking-[-0.03em] text-foam">
            {brandPrimary}
          </h1>
          <p
            className="animate-rise mt-6 max-w-md text-lg font-light leading-snug text-foam/88 md:text-2xl"
            style={{ animationDelay: "70ms" }}
          >
            {tagline}
          </p>
          <p
            className="animate-rise mt-4 max-w-md text-sm leading-relaxed text-foam/60 md:text-base"
            style={{ animationDelay: "120ms" }}
          >
            {t(locale, "landing.support")}
          </p>
          <div
            className="animate-rise mt-10 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Link
              href="/trips"
              className="rounded-bp bg-timber px-6 py-3.5 text-sm font-semibold tracking-wide text-foam shadow-bp transition duration-bp ease-bp hover:brightness-110"
            >
              {t(locale, "cta.startPlanning")}
            </Link>
            <Link
              href="/translate"
              className="rounded-bp border border-foam/25 bg-foam/5 px-6 py-3.5 text-sm font-medium text-foam/90 backdrop-blur-sm transition duration-bp-fast ease-bp hover:border-foam/50 hover:bg-foam/10"
            >
              {t(locale, "nav.translate")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
