import Link from "next/link";
import { brand } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { getLocale } from "@/lib/locale";
import { LandingScrollDeck } from "@/components/landing/scroll-deck";
import { LandingScrollStack } from "@/components/landing/scroll-stack";

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

  const pillarCards = PILLARS.map((pillar) => ({
    title: t(locale, pillar.title),
    body: t(locale, pillar.body),
  }));

  const howCards = HOW_STEPS.map((step) => ({
    title: t(locale, step.title),
    body: t(locale, step.body),
  }));

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

      {/* Below fold — tip 019 stacked cards (pillars) */}
      <LandingScrollStack
        title={t(locale, "landing.pillars.title")}
        support={t(locale, "landing.pillars.support")}
        cards={pillarCards}
      />

      {/* Below fold — tip 019 card deck (how it works) */}
      <LandingScrollDeck
        title={t(locale, "landing.how.title")}
        support={t(locale, "landing.how.support")}
        cards={howCards}
        ctaLabel={t(locale, "cta.viewTrips")}
        ctaHref="/trips"
      />
    </>
  );
}
