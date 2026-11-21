"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SHARE_TEMPLATES, type Trip } from "@beaver/core";
import { brand } from "@beaver/ui-tokens";
import { t, type Locale, type MessageKey } from "@beaver/i18n";
import { SoftFailNotice } from "@/components/soft-fail-notice";
import { apiGet } from "@/lib/api";
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

const CHIP_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/** Mist-track segmented control — nested #46 radii, azure active, tip-020 chips. */
function Segmented<T extends string>({
  value,
  options,
  labelFor,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly T[];
  labelFor: (opt: T) => string;
  onChange: (opt: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-bp-sm bg-mist/50 p-1"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={`rounded-bp-xs px-3.5 py-2 text-sm font-semibold bp-transition ${CHIP_FOCUS} ${
              active
                ? "bg-foam text-river shadow-bp-soft"
                : "text-ink-soft hover:text-river"
            }`}
          >
            {labelFor(opt)}
          </button>
        );
      })}
    </div>
  );
}

function SectionEyebrow({ children }: { children: string }) {
  return (
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-river">
      {children}
    </p>
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
      } catch {
        setResolve(null);
        // Soft inline notice for any resolve miss — prefs still persist locally.
        setSoftNotice(t(locale, "settings.softOffline"));
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
  const showSoftFail = Boolean(softNotice) && !pending;
  const statusCopy = pending
    ? t(locale, "settings.resolving")
    : resolve
      ? t(locale, "settings.resolved")
          .replace("{engine}", resolve.engineId)
          .replace("{mode}", resolve.mode)
          .replace("{region}", resolve.region)
      : null;

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

      <header className="animate-rise">
        <SectionEyebrow>{t(locale, "settings.eyebrow")}</SectionEyebrow>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {t(locale, "settings.title")}
        </h1>
        <p
          className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft"
        >
          {t(locale, "settings.support")}
        </p>
        <p className="mt-2 text-sm text-ink-soft/80">
          {brandName} · {t(locale, "settings.localHint")}
        </p>
      </header>

      <div className="mt-14 space-y-0">
        {/* Language */}
        <section
          className="animate-rise border-t border-[color:var(--bp-line)] py-10"
          style={{ animationDelay: "40ms" }}
          aria-labelledby="settings-locale-heading"
        >
          <header className="mb-6">
            <SectionEyebrow>
              {t(locale, "settings.localeEyebrow")}
            </SectionEyebrow>
            <h2
              id="settings-locale-heading"
              className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink"
            >
              {t(locale, "settings.locale")}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
              {t(locale, "settings.localeSupport")}
            </p>
          </header>
          <Segmented
            value={prefs.locale}
            options={LOCALE_OPTS}
            ariaLabel={t(locale, "settings.locale")}
            labelFor={(opt) =>
              t(locale, `settings.locale.${opt}` as MessageKey)
            }
            onChange={(next) => applyPatch({ locale: next })}
          />
        </section>

        {/* Map engine — SoftFailNotice stack lives here (section-scoped, rise in/out) */}
        <section
          className="animate-rise border-t border-[color:var(--bp-line)] py-10"
          style={{ animationDelay: "80ms" }}
          aria-labelledby="settings-map-heading"
        >
          <header className="mb-6">
            <SectionEyebrow>{t(locale, "settings.mapEyebrow")}</SectionEyebrow>
            <h2
              id="settings-map-heading"
              className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink"
            >
              {t(locale, "settings.mapEngine")}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
              {t(locale, "settings.mapEngineSupport")}
            </p>
          </header>

          <SoftFailNotice open={showSoftFail} className="mb-6">
            {softNotice ?? t(locale, "settings.resolvedDemo")}
          </SoftFailNotice>

          <Segmented
            value={prefs.mapEngine}
            options={MAP_OPTS}
            ariaLabel={t(locale, "settings.mapEngine")}
            labelFor={(opt) => t(locale, `planner.pref.${opt}` as MessageKey)}
            onChange={(next) => applyPatch({ mapEngine: next })}
          />

          {statusCopy ? (
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              {statusCopy}
            </p>
          ) : null}
        </section>

        {/* Distance */}
        <section
          className="animate-rise border-t border-[color:var(--bp-line)] py-10"
          style={{ animationDelay: "120ms" }}
          aria-labelledby="settings-distance-heading"
        >
          <header className="mb-6">
            <SectionEyebrow>
              {t(locale, "settings.distanceEyebrow")}
            </SectionEyebrow>
            <h2
              id="settings-distance-heading"
              className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink"
            >
              {t(locale, "settings.distance")}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
              {t(locale, "settings.distanceSupport")}
            </p>
          </header>
          <Segmented
            value={prefs.distanceUnit}
            options={DISTANCE_OPTS}
            ariaLabel={t(locale, "settings.distance")}
            labelFor={(opt) =>
              t(locale, `settings.distance.${opt}` as MessageKey)
            }
            onChange={(next) => applyPatch({ distanceUnit: next })}
          />
        </section>

        {/* Share template */}
        <section
          className="animate-rise border-t border-b border-[color:var(--bp-line)] py-10"
          style={{ animationDelay: "160ms" }}
          aria-labelledby="settings-share-heading"
        >
          <header className="mb-6">
            <SectionEyebrow>
              {t(locale, "settings.shareEyebrow")}
            </SectionEyebrow>
            <h2
              id="settings-share-heading"
              className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink"
            >
              {t(locale, "settings.shareTemplate")}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
              {t(locale, "settings.shareTemplateSupport")}
            </p>
          </header>
          <ul className="space-y-0">
            {SHARE_TEMPLATES.map((tpl, index) => {
              const selected = prefs.shareImageTemplateId === tpl.id;
              const name = locale === "zh-CN" ? tpl.nameZh : tpl.nameEn;
              const blurb = locale === "zh-CN" ? tpl.blurbZh : tpl.blurbEn;
              return (
                <li key={tpl.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      applyPatch({ shareImageTemplateId: tpl.id })
                    }
                    className={`group flex w-full items-baseline gap-4 border-t border-[color:var(--bp-line)] py-5 text-left bp-transition last:border-b ${CHIP_FOCUS} ${
                      selected
                        ? "border-l-2 border-l-river pl-3 text-river"
                        : "border-l-2 border-l-transparent pl-3 text-ink hover:border-l-river/35 hover:text-river"
                    }`}
                  >
                    <span
                      className={`font-display text-xl font-bold tabular-nums bp-transition ${
                        selected
                          ? "text-river"
                          : "text-mist group-hover:text-river/50"
                      }`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-semibold tracking-tight bp-transition md:text-xl">
                        {name}
                      </span>
                      <span className="mt-1 block text-sm text-ink-soft">
                        {blurb}
                      </span>
                    </span>
                    {selected ? (
                      <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-river">
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
          className={`rounded-bp-xs font-semibold text-river bp-transition hover:text-river-deep ${CHIP_FOCUS}`}
        >
          ← {t(locale, "nav.trips")}
        </Link>
      </p>
    </section>
  );
}
