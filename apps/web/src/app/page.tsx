import { brand } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { getLocale } from "@/lib/locale";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooterCta } from "@/components/landing/footer-cta";
import { LandingHero } from "@/components/landing/hero";
import { LandingScrollDeck } from "@/components/landing/scroll-deck";

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

  const featureItems = PILLARS.map((pillar) => ({
    title: t(locale, pillar.title),
    body: t(locale, pillar.body),
  }));

  const howCards = HOW_STEPS.map((step) => ({
    title: t(locale, step.title),
    body: t(locale, step.body),
  }));

  return (
    <>
      {/* First viewport — brand · headline · support · CTA · full-bleed plane */}
      <LandingHero
        brandPrimary={brandPrimary}
        brandSecondary={brandSecondary}
        headline={headline}
        support={t(locale, "landing.support")}
        primaryLabel={t(locale, "cta.startPlanning")}
        primaryHref="/trips"
        secondaryLabel={t(locale, "nav.translate")}
        secondaryHref="/translate"
      />

      {/* Below fold — features (editorial hierarchy; after tip 019 scroll craft) */}
      <LandingFeatures
        title={t(locale, "landing.pillars.title")}
        support={t(locale, "landing.pillars.support")}
        items={featureItems}
      />

      {/* Below fold — tip 019 card deck (how it works) */}
      <LandingScrollDeck
        title={t(locale, "landing.how.title")}
        support={t(locale, "landing.how.support")}
        cards={howCards}
        ctaLabel={t(locale, "cta.viewTrips")}
        ctaHref="/trips"
      />

      {/* Finale — CTA + quiet site footer (after features / how) */}
      <LandingFooterCta
        brandPrimary={brandPrimary}
        brandSecondary={brandSecondary}
        title={t(locale, "landing.finale.title")}
        support={t(locale, "landing.finale.support")}
        primaryLabel={t(locale, "cta.startPlanning")}
        primaryHref="/trips"
        secondaryLabel={t(locale, "nav.translate")}
        secondaryHref="/translate"
        navTrips={t(locale, "nav.trips")}
        navTranslate={t(locale, "nav.translate")}
        navSettings={t(locale, "nav.settings")}
        meta={t(locale, "landing.finale.meta")}
      />
    </>
  );
}
