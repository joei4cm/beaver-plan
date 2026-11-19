import Link from "next/link";
import { brand } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { getLocale } from "@/lib/locale";

const PILLARS = [
  { title: "landing.pillars.map.title", body: "landing.pillars.map.body" },
  {
    title: "landing.pillars.transit.title",
    body: "landing.pillars.transit.body",
  },
  {
    title: "landing.pillars.journal.title",
    body: "landing.pillars.journal.body",
  },
  {
    title: "landing.pillars.translate.title",
    body: "landing.pillars.translate.body",
  },
  { title: "landing.pillars.ux.title", body: "landing.pillars.ux.body" },
] as const;

const HOW_STEPS = [
  { title: "landing.how.step1.title", body: "landing.how.step1.body" },
  { title: "landing.how.step2.title", body: "landing.how.step2.body" },
  { title: "landing.how.step3.title", body: "landing.how.step3.body" },
] as const;

export default async function HomePage() {
  const locale = await getLocale();
  const brandPrimary = locale === "zh-CN" ? brand.zh : brand.en;
  const brandSecondary = locale === "zh-CN" ? brand.en : brand.zh;
  const headline = locale === "zh-CN" ? brand.taglineZh : brand.taglineEn;

  return (
    <>
      {/* First viewport — one composition: brand · headline · support · CTA · plane */}
      <section className="relative isolate min-h-[calc(100dvh-4.5rem)] overflow-hidden">
        {/* Full-bleed luminous sky — travel daylight, not purple / cream / atlas night */}
        <div
          aria-hidden
          className="animate-drift pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 95% 70% at 78% 22%, rgba(47, 107, 255, 0.28), transparent 55%),
              radial-gradient(ellipse 60% 50% at 12% 88%, rgba(96, 165, 250, 0.2), transparent 50%),
              radial-gradient(ellipse 40% 30% at 48% 48%, rgba(219, 232, 255, 0.55), transparent 70%),
              linear-gradient(168deg, #dbe8ff 0%, #eef3fb 38%, #f4f6fa 72%, #ffffff 100%)
            `,
          }}
        />
        <div
          aria-hidden
          className="bp-topo pointer-events-none absolute inset-0 -z-10 opacity-60"
        />
        {/* Atmospheric route plane — path draws, then stop markers pop */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
        >
          <path
            d="M60 740 C 180 620, 260 680, 360 560 S 520 360, 640 400 S 820 520, 960 340 S 1180 160, 1380 220"
            fill="none"
            stroke="#2F6BFF"
            strokeWidth="10"
            strokeLinecap="round"
            opacity="0.08"
          />
          <path
            className="animate-route-draw"
            d="M60 740 C 180 620, 260 680, 360 560 S 520 360, 640 400 S 820 520, 960 340 S 1180 160, 1380 220"
            fill="none"
            stroke="#2F6BFF"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeDasharray="1"
            strokeDashoffset="1"
            pathLength={1}
          />
          <g className="animate-marker-pop" style={{ animationDelay: "480ms" }}>
            <circle cx="360" cy="560" r="11" fill="#FFFFFF" />
            <circle cx="360" cy="560" r="7" fill="#2F6BFF" />
          </g>
          <g className="animate-marker-pop" style={{ animationDelay: "620ms" }}>
            <circle cx="640" cy="400" r="11" fill="#FFFFFF" />
            <circle cx="640" cy="400" r="7" fill="#2F6BFF" />
          </g>
          <g className="animate-marker-pop" style={{ animationDelay: "760ms" }}>
            <circle cx="960" cy="340" r="11" fill="#FFFFFF" />
            <circle cx="960" cy="340" r="7" fill="#2F6BFF" />
          </g>
          <g className="animate-marker-pop" style={{ animationDelay: "900ms" }}>
            <circle cx="1380" cy="220" r="13" fill="#FFFFFF" />
            <circle cx="1380" cy="220" r="8" fill="#0F172A" />
          </g>
        </svg>

        <div className="mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-6xl flex-col justify-end px-6 pb-20 pt-10 md:justify-center md:px-10 md:pb-28 md:pt-6">
          <div className="max-w-3xl">
            {/* Brand as hero-level signal — both names; passes brand test without nav */}
            <p className="animate-fade font-display text-base font-semibold tracking-[-0.02em] text-river md:text-lg">
              {brandSecondary}
            </p>
            <h1 className="animate-rise mt-2 font-display text-[clamp(3.5rem,10vw,6.75rem)] font-extrabold leading-[0.9] tracking-[-0.045em] text-ink">
              {brandPrimary}
            </h1>
            {/* One headline */}
            <p
              className="animate-rise mt-7 max-w-lg font-display text-xl font-semibold leading-snug tracking-[-0.02em] text-ink md:text-3xl"
              style={{ animationDelay: "80ms" }}
            >
              {headline}
            </p>
            {/* One support sentence */}
            <p
              className="animate-rise mt-4 max-w-md text-sm leading-relaxed text-ink-soft md:text-base"
              style={{ animationDelay: "140ms" }}
            >
              {t(locale, "landing.support")}
            </p>
            {/* One CTA group */}
            <div
              className="animate-rise mt-10 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "200ms" }}
            >
              <Link
                href="/trips"
                className="rounded-bp bg-river px-6 py-3.5 text-sm font-semibold tracking-wide text-foam shadow-bp transition duration-bp ease-bp hover:bg-river-deep"
              >
                {t(locale, "cta.startPlanning")}
              </Link>
              <Link
                href="/translate"
                className="rounded-bp border border-ink/12 bg-foam/75 px-6 py-3.5 text-sm font-semibold text-ink backdrop-blur-sm transition duration-bp-fast ease-bp hover:border-river/40 hover:text-river"
              >
                {t(locale, "nav.translate")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Below fold — pillars: one job, editorial rows, no card soup */}
      <section className="border-t border-ink/8 bg-foam">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
          <h2 className="animate-rise font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
            {t(locale, "landing.pillars.title")}
          </h2>
          <p
            className="animate-rise mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base"
            style={{ animationDelay: "60ms" }}
          >
            {t(locale, "landing.pillars.support")}
          </p>
          <ul className="mt-12 divide-y divide-ink/8 border-y border-ink/8">
            {PILLARS.map((pillar, index) => (
              <li
                key={pillar.title}
                className="animate-rise grid gap-2 py-6 md:grid-cols-[minmax(10rem,14rem)_1fr] md:gap-10 md:py-7"
                style={{ animationDelay: `${100 + index * 50}ms` }}
              >
                <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
                  {t(locale, pillar.title)}
                </span>
                <span className="text-sm leading-relaxed text-ink-soft md:text-base">
                  {t(locale, pillar.body)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Below fold — how it works: three steps, one job */}
      <section className="border-t border-ink/8 bg-paper">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
          <h2 className="animate-rise font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
            {t(locale, "landing.how.title")}
          </h2>
          <p
            className="animate-rise mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base"
            style={{ animationDelay: "60ms" }}
          >
            {t(locale, "landing.how.support")}
          </p>
          <ol className="mt-12 space-y-10 md:space-y-12">
            {HOW_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="animate-rise flex gap-5 md:gap-8"
                style={{ animationDelay: `${100 + index * 70}ms` }}
              >
                <span
                  aria-hidden
                  className="font-display text-3xl font-extrabold leading-none tracking-[-0.04em] text-river/35 md:text-4xl"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="pt-1">
                  <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink md:text-2xl">
                    {t(locale, step.title)}
                  </h3>
                  <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft md:text-base">
                    {t(locale, step.body)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div
            className="animate-rise mt-14"
            style={{ animationDelay: "320ms" }}
          >
            <Link
              href="/trips"
              className="inline-flex rounded-bp bg-ink px-6 py-3.5 text-sm font-semibold tracking-wide text-foam transition duration-bp ease-bp hover:bg-river"
            >
              {t(locale, "cta.viewTrips")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
