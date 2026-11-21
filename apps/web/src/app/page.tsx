import { brand } from "@beaver/ui-tokens";
import { t } from "@beaver/i18n";
import { getLocale } from "@/lib/locale";
import { LandingFaq } from "@/components/landing/faq";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooterCta } from "@/components/landing/footer-cta";
import { LandingHero } from "@/components/landing/hero";
import { LandingScrollDeck } from "@/components/landing/scroll-deck";
import { LandingSocialProof } from "@/components/landing/social-proof";

const TRUST_SIGNALS = [
  {
    label: "landing.trust.signal1.label",
    detail: "landing.trust.signal1.detail",
  },
  {
    label: "landing.trust.signal2.label",
    detail: "landing.trust.signal2.detail",
  },
  {
    label: "landing.trust.signal3.label",
    detail: "landing.trust.signal3.detail",
  },
] as const;

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

const FAQ_TOPICS = [
  { id: "all", label: "landing.faq.topic.all" },
  { id: "plan", label: "landing.faq.topic.plan" },
  { id: "maps", label: "landing.faq.topic.maps" },
  { id: "road", label: "landing.faq.topic.road" },
] as const;

const FAQ_ITEMS = [
  {
    id: "what",
    topic: "plan",
    question: "landing.faq.q1.question",
    answer: "landing.faq.q1.answer",
  },
  {
    id: "roads",
    topic: "maps",
    question: "landing.faq.q2.question",
    answer: "landing.faq.q2.answer",
  },
  {
    id: "collab",
    topic: "plan",
    question: "landing.faq.q3.question",
    answer: "landing.faq.q3.answer",
  },
  {
    id: "engines",
    topic: "maps",
    question: "landing.faq.q4.question",
    answer: "landing.faq.q4.answer",
  },
  {
    id: "translate",
    topic: "road",
    question: "landing.faq.q5.question",
    answer: "landing.faq.q5.answer",
  },
  {
    id: "offline",
    topic: "road",
    question: "landing.faq.q6.question",
    answer: "landing.faq.q6.answer",
  },
] as const;

export default async function HomePage() {
  const locale = await getLocale();
  const brandPrimary = locale === "zh-CN" ? brand.zh : brand.en;
  const brandSecondary = locale === "zh-CN" ? brand.en : brand.zh;
  const headline = locale === "zh-CN" ? brand.taglineZh : brand.taglineEn;

  const trustSignals = TRUST_SIGNALS.map((signal) => ({
    label: t(locale, signal.label),
    detail: t(locale, signal.detail),
  }));

  const featureItems = PILLARS.map((pillar) => ({
    title: t(locale, pillar.title),
    body: t(locale, pillar.body),
  }));

  const howCards = HOW_STEPS.map((step) => ({
    title: t(locale, step.title),
    body: t(locale, step.body),
  }));

  const faqTopics = FAQ_TOPICS.map((topic) => ({
    id: topic.id,
    label: t(locale, topic.label),
  }));

  const faqItems = FAQ_ITEMS.map((item) => ({
    id: item.id,
    topic: item.topic,
    question: t(locale, item.question),
    answer: t(locale, item.answer),
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

      {/* Below hero — trust / social proof (one job; no card clutter) */}
      <LandingSocialProof
        title={t(locale, "landing.trust.title")}
        support={t(locale, "landing.trust.support")}
        quote={t(locale, "landing.trust.quote")}
        attribution={t(locale, "landing.trust.attribution")}
        signals={trustSignals}
      />

      {/* Below fold — features depth (mist-track focus · SoftFail · tip-011) */}
      <LandingFeatures
        title={t(locale, "landing.pillars.title")}
        support={t(locale, "landing.pillars.support")}
        items={featureItems}
        offlineNotice={t(locale, "landing.pillars.softOffline")}
        focusLabel={t(locale, "landing.pillars.focusLabel")}
        leadEyebrow={t(locale, "landing.pillars.leadEyebrow")}
      />

      {/* Below fold — tip 019 how-it-works depth (mist-track · SoftFail · tip-011) */}
      <LandingScrollDeck
        title={t(locale, "landing.how.title")}
        support={t(locale, "landing.how.support")}
        cards={howCards}
        ctaLabel={t(locale, "cta.viewTrips")}
        ctaHref="/trips"
        offlineNotice={t(locale, "landing.how.softOffline")}
        stepEyebrow={t(locale, "landing.how.stepEyebrow")}
        progressLabel={t(locale, "landing.how.progressLabel")}
        focusLabel={t(locale, "landing.how.focusLabel")}
        liveBadge={t(locale, "landing.how.liveBadge")}
      />

      {/* Below fold — FAQ SoftFail sheet (azure rail · Offline/Live · tip-011) */}
      <LandingFaq
        title={t(locale, "landing.faq.title")}
        support={t(locale, "landing.faq.support")}
        topics={faqTopics}
        items={faqItems}
        offlineNotice={t(locale, "landing.faq.softOffline")}
        filterLabel={t(locale, "landing.faq.filterLabel")}
        sheetEyebrow={t(locale, "landing.faq.sheetEyebrow")}
        sheetSupport={t(locale, "landing.faq.sheetSupport")}
        offlineBadge={t(locale, "landing.faq.offlineBadge")}
        liveBadge={t(locale, "landing.faq.liveBadge")}
      />

      {/* Finale — CTA + quiet site footer (after features / how / faq) */}
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
