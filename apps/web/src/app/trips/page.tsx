import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@beaver/i18n";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: "Trips",
};

const samples = [
  {
    id: "sample-kyoto",
    titleKey: "trips.placeholder.kyoto" as const,
    metaKey: "trips.placeholder.kyotoMeta" as const,
    accent: "from-river/30 to-mist/40",
  },
  {
    id: "sample-osaka",
    titleKey: "trips.placeholder.osaka" as const,
    metaKey: "trips.placeholder.osakaMeta" as const,
    accent: "from-timber/25 to-paper",
    disabled: true,
  },
];

export default async function TripsPage() {
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-8 md:px-10">
      <div className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-ink md:text-5xl">
            {t(locale, "trips.title")}
          </h1>
          <p className="mt-3 max-w-lg text-ink-soft">{t(locale, "trips.empty")}</p>
        </div>
        <Link
          href="/trips/sample-kyoto"
          className="rounded-md bg-river px-4 py-2.5 text-sm text-foam transition hover:bg-river-deep"
        >
          {t(locale, "trips.openSample")}
        </Link>
      </div>

      <ul className="mt-12 space-y-0 divide-y divide-[color:var(--bp-line)] border-y border-[color:var(--bp-line)]">
        {samples.map((trip, index) => (
          <li
            key={trip.id}
            className="animate-rise group relative"
            style={{ animationDelay: `${index * 70 + 60}ms` }}
          >
            {"disabled" in trip && trip.disabled ? (
              <div className="flex items-stretch gap-0 opacity-55">
                <div
                  className={`hidden w-28 shrink-0 bg-gradient-to-br ${trip.accent} sm:block`}
                  aria-hidden
                />
                <div className="flex flex-1 flex-col gap-1 px-1 py-7 sm:px-6">
                  <span className="font-display text-2xl text-ink">
                    {t(locale, trip.titleKey)}
                  </span>
                  <span className="text-sm text-ink-soft/80">
                    {t(locale, trip.metaKey)}
                  </span>
                </div>
              </div>
            ) : (
              <Link
                href={`/trips/${trip.id}`}
                className="flex items-stretch gap-0 transition hover:bg-foam/40"
              >
                <div
                  className={`hidden w-28 shrink-0 bg-gradient-to-br ${trip.accent} sm:block`}
                  aria-hidden
                />
                <div className="flex flex-1 flex-col gap-1 px-1 py-7 sm:px-6">
                  <span className="font-display text-2xl text-ink transition group-hover:text-river">
                    {t(locale, trip.titleKey)}
                  </span>
                  <span className="text-sm text-ink-soft/80">
                    {t(locale, trip.metaKey)}
                  </span>
                </div>
                <span className="flex items-center pr-2 text-river opacity-0 transition group-hover:opacity-100 sm:pr-4">
                  →
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
