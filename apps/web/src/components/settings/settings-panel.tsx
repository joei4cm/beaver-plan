"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SHARE_TEMPLATES, type Trip } from "@beaver/core";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale } from "@beaver/i18n";
import { apiGet, isPlannerNoiseError } from "@/lib/api";
import {
  type DistanceUnit,
  type UserPrefs,
  patchUserPrefs,
  readUserPrefs,
} from "@/lib/user-prefs";

type Props = {
  locale: Locale;
};

type EngineResolve = {
  preference: string;
  region: string;
  engineId: string;
  mode: string;
  autoAmapCn?: boolean;
};

const MAP_OPTS: Trip["mapEngine"][] = ["auto", "google", "amap", "baidu"];
const LOCALE_OPTS: Locale[] = ["zh-CN", "en"];
const DISTANCE_OPTS: DistanceUnit[] = ["km", "mi"];

function Segmented<T extends string>({
  value,
  options,
  labelFor,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labelFor: (opt: T) => string;
  onChange: (opt: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-bp border border-[color:var(--bp-line)]">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3.5 py-2 text-sm font-semibold transition duration-bp-fast ease-bp ${
              active
                ? "bg-river text-foam"
                : "bg-foam/50 text-ink-soft hover:text-river"
            }`}
          >
            {labelFor(opt)}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsPanel({ locale: initialLocale }: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<UserPrefs>(() => ({
    ...readUserPrefs(),
    locale: initialLocale,
  }));
  const [hydrated, setHydrated] = useState(false);
  const [resolve, setResolve] = useState<EngineResolve | null>(null);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const locale = prefs.locale;

  const probeEngine = useCallback(
    async (preference: Trip["mapEngine"]) => {
      try {
        const tz =
          typeof Intl !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : "";
        const res = await apiGet<EngineResolve>(
          `/v1/maps/engine?preference=${encodeURIComponent(preference)}&timezone=${encodeURIComponent(tz)}`,
        );
        setResolve(res);
        setSoftNotice(null);
      } catch (err) {
        setResolve(null);
        if (isPlannerNoiseError(err)) {
          setSoftNotice(t(locale, "settings.softOffline"));
        } else {
          setSoftNotice(t(locale, "settings.softOffline"));
        }
      }
    },
    [locale],
  );

  useEffect(() => {
    const stored = readUserPrefs();
    setPrefs({ ...stored, locale: initialLocale });
    setHydrated(true);
  }, [initialLocale]);

  useEffect(() => {
    if (!hydrated) return;
    startTransition(() => {
      void probeEngine(prefs.mapEngine);
    });
  }, [hydrated, prefs.mapEngine, probeEngine]);

  function applyPatch(patch: Partial<UserPrefs>) {
    const next = patchUserPrefs(patch);
    setPrefs(next);
    if (patch.locale && patch.locale !== initialLocale) {
      router.refresh();
    }
  }

  const brandName = locale === "zh-CN" ? brand.zh : brand.en;

  return (
    <section className="relative mx-auto max-w-3xl px-6 pb-24 pt-10 md:px-10 md:pt-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] opacity-90"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 55% at 12% 0%, rgba(47,107,255,0.14), transparent 58%),
            radial-gradient(ellipse 50% 40% at 88% 8%, rgba(96,165,250,0.12), transparent 52%),
            linear-gradient(180deg, #dbe8ff 0%, transparent 70%)
          `,
        }}
      />

      <p className="animate-fade text-xs font-semibold uppercase tracking-[0.22em] text-river/80">
        {brand.en}
      </p>
      <h1 className="animate-rise mt-3 font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
        {t(locale, "settings.title")}
      </h1>
      <p
        className="animate-rise mt-4 max-w-xl text-base leading-relaxed text-ink-soft"
        style={{ animationDelay: "40ms" }}
      >
        {t(locale, "settings.support")}
      </p>
      <p className="mt-2 text-sm text-ink-soft/80">
        {brandName} · {t(locale, "settings.localHint")}
      </p>

      {softNotice && (
        <p
          className="animate-fade mt-8 border-l-2 border-river/35 bg-mist/45 px-4 py-3 text-sm text-ink-soft"
          role="status"
        >
          {softNotice}
        </p>
      )}

      <div className="mt-14 space-y-0">
        {/* Language */}
        <section
          className="animate-rise border-t border-[color:var(--bp-line)] py-10"
          style={{ animationDelay: "60ms" }}
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {t(locale, "settings.locale")}
          </h2>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">
            {t(locale, "settings.localeSupport")}
          </p>
          <div className="mt-6">
            <Segmented
              value={prefs.locale}
              options={LOCALE_OPTS}
              labelFor={(opt) => t(locale, `settings.locale.${opt}`)}
              onChange={(next) => applyPatch({ locale: next })}
            />
          </div>
        </section>

        {/* Map engine */}
        <section
          className="animate-rise border-t border-[color:var(--bp-line)] py-10"
          style={{ animationDelay: "100ms" }}
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {t(locale, "settings.mapEngine")}
          </h2>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">
            {t(locale, "settings.mapEngineSupport")}
          </p>
          <div className="mt-6">
            <Segmented
              value={prefs.mapEngine}
              options={MAP_OPTS}
              labelFor={(opt) => t(locale, `planner.pref.${opt}`)}
              onChange={(next) => applyPatch({ mapEngine: next })}
            />
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            {pending && !resolve
              ? t(locale, "settings.resolving")
              : resolve
                ? t(locale, "settings.resolved")
                    .replace("{engine}", resolve.engineId)
                    .replace("{mode}", resolve.mode)
                    .replace("{region}", resolve.region)
                : t(locale, "settings.resolvedDemo")}
          </p>
        </section>

        {/* Distance */}
        <section
          className="animate-rise border-t border-[color:var(--bp-line)] py-10"
          style={{ animationDelay: "140ms" }}
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {t(locale, "settings.distance")}
          </h2>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">
            {t(locale, "settings.distanceSupport")}
          </p>
          <div className="mt-6">
            <Segmented
              value={prefs.distanceUnit}
              options={DISTANCE_OPTS}
              labelFor={(opt) => t(locale, `settings.distance.${opt}`)}
              onChange={(next) => applyPatch({ distanceUnit: next })}
            />
          </div>
        </section>

        {/* Share template */}
        <section
          className="animate-rise border-t border-b border-[color:var(--bp-line)] py-10"
          style={{ animationDelay: "180ms" }}
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {t(locale, "settings.shareTemplate")}
          </h2>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">
            {t(locale, "settings.shareTemplateSupport")}
          </p>
          <ul className="mt-6">
            {SHARE_TEMPLATES.map((tpl, index) => {
              const selected = prefs.shareImageTemplateId === tpl.id;
              const name = locale === "zh-CN" ? tpl.nameZh : tpl.nameEn;
              const blurb = locale === "zh-CN" ? tpl.blurbZh : tpl.blurbEn;
              return (
                <li key={tpl.id}>
                  <button
                    type="button"
                    onClick={() =>
                      applyPatch({ shareImageTemplateId: tpl.id })
                    }
                    className={`group flex w-full items-baseline gap-4 border-t border-[color:var(--bp-line)] py-5 text-left transition last:border-b ${
                      selected ? "text-river" : "text-ink"
                    }`}
                  >
                    <span
                      className={`font-display text-xl font-bold tabular-nums ${
                        selected ? "text-river" : "text-mist"
                      }`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-semibold tracking-tight transition group-hover:text-river md:text-xl">
                        {name}
                      </span>
                      <span className="mt-1 block text-sm text-ink-soft">
                        {blurb}
                      </span>
                    </span>
                    {selected ? (
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-river">
                        {t(locale, "settings.selected")}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <p className="mt-10 text-sm text-ink-soft">
        <Link
          href="/trips"
          className="font-semibold text-river transition hover:text-river-deep"
        >
          ← {t(locale, "nav.trips")}
        </Link>
      </p>
    </section>
  );
}
