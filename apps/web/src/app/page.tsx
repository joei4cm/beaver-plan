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
      {/* Full-bleed luminous sky plane — not dark atlas */}
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 55% at 72% 38%, rgba(47, 107, 255, 0.22), transparent 58%),
            radial-gradient(ellipse 55% 40% at 18% 78%, rgba(96, 165, 250, 0.18), transparent 52%),
            linear-gradient(165deg, #dbe8ff 0%, #eef3fb 42%, #f7f9fc 78%, #ffffff 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="bp-topo pointer-events-none absolute inset-0 -z-10 opacity-70"
      />
      {/* Abstract route path as atmosphere */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-40"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M80 620 C 220 480, 320 520, 420 380 S 620 220, 780 280 S 980 420, 1120 180"
          fill="none"
          stroke="#2F6BFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="10 14"
          opacity="0.55"
        />
        <circle cx="420" cy="380" r="7" fill="#2F6BFF" opacity="0.85" />
        <circle cx="780" cy="280" r="7" fill="#2F6BFF" opacity="0.85" />
        <circle cx="1120" cy="180" r="9" fill="#0F172A" opacity="0.7" />
      </svg>

      <div className="mx-auto flex max-w-6xl flex-col justify-end px-6 pb-16 pt-16 md:min-h-[calc(100vh-4.25rem)] md:justify-center md:px-10 md:pb-28 md:pt-8">
        <div className="max-w-3xl">
          <p className="animate-fade text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-river md:text-xs">
            {brandSecondary}
          </p>
          <h1 className="animate-rise mt-4 font-display text-[clamp(3.25rem,9vw,6.25rem)] font-extrabold leading-[0.92] tracking-[-0.04em] text-ink">
            {brandPrimary}
          </h1>
          <p
            className="animate-rise mt-6 max-w-md text-lg font-medium leading-snug text-ink/85 md:text-2xl"
            style={{ animationDelay: "70ms" }}
          >
            {tagline}
          </p>
          <p
            className="animate-rise mt-4 max-w-md text-sm leading-relaxed text-ink-soft md:text-base"
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
              className="rounded-bp bg-river px-6 py-3.5 text-sm font-semibold tracking-wide text-foam shadow-bp transition duration-bp ease-bp hover:bg-river-deep"
            >
              {t(locale, "cta.startPlanning")}
            </Link>
            <Link
              href="/translate"
              className="rounded-bp border border-ink/12 bg-foam/70 px-6 py-3.5 text-sm font-semibold text-ink backdrop-blur-sm transition duration-bp-fast ease-bp hover:border-river/40 hover:text-river"
            >
              {t(locale, "nav.translate")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
