import { softFailMistWashClass } from "@/components/soft-fail-notice";

type SkeletonProps = {
  className?: string;
};

/** Tip 017 — placeholder shape; band is drawn by `.bp-skeleton`. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div aria-hidden className={`bp-skeleton ${className}`} />;
}

/** Layout-matched trips list (azure rail · soft-notice · dense number · title · meta · azure action). */
export function TripsListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft">
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-5 w-12 rounded-bp-xs" />
        </div>
        <Skeleton className="h-9 w-full rounded-none" />
        <ul className="space-y-0">
          {Array.from({ length: rows }).map((_, i) => (
            <li
              key={i}
              className="border-t border-[color:var(--bp-line)] px-4 py-4 first:border-t-0 sm:px-5"
            >
              <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-5">
                <Skeleton className="h-6 w-8 shrink-0 md:h-7 md:w-10" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-5 w-44 max-w-[70%]" />
                  <Skeleton className="h-3 w-56 max-w-[85%]" />
                </div>
                <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-6 w-20 rounded-bp-xs" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Layout-matched city playbooks SoftFail depth — azure rail · SoftFail · mist tip-011 body. */
export function TemplatesListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam/95 shadow-bp-soft">
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)] sm:px-5">
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-5 w-14 rounded-bp-xs" />
        </div>
        {/* SoftFailNotice mist band under Playbooks rail */}
        <Skeleton className="h-9 w-full rounded-none" />
        <ul className={`space-y-0 ${softFailMistWashClass}`}>
          {Array.from({ length: rows }).map((_, i) => (
            <li
              key={i}
              className="grid grid-cols-[auto_1fr] items-start gap-3 border-t border-[color:var(--bp-line)] px-4 py-4 first:border-t-0 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-5 sm:px-5 sm:py-[1.125rem]"
            >
              <Skeleton className="h-6 w-8 shrink-0 md:h-7 md:w-10" />
              <div className="min-w-0 space-y-1.5">
                <Skeleton className="h-5 w-44 max-w-[70%]" />
                <Skeleton className="h-3 w-full max-w-md" />
                <Skeleton className="h-3 w-36" />
              </div>
              <div className="col-span-2 flex flex-col gap-2 sm:col-span-1 sm:flex-row sm:items-center">
                <Skeleton className="h-10 w-full rounded-bp sm:w-28" />
                <Skeleton className="h-10 w-full rounded-bp sm:w-24" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PlannerSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto max-w-[1480px] px-3 pb-16 pt-2 md:px-6 lg:px-8 lg:pt-4"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--bp-line)] pb-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-10 w-72 max-w-full" />
        </div>
        {/* Share CTA SoftFail depth — azure Export rail · softSupport · SoftFail mist band · mist tip-011 CTA (BEA-362) */}
        <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft sm:w-auto">
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-2.5 w-40" />
            </div>
            <Skeleton className="h-5 w-16 rounded-bp-xs" />
          </div>
          <Skeleton className="h-9 w-full rounded-none" />
          <div className={`flex items-center justify-end gap-2 ${softFailMistWashClass} px-3 py-2.5`}>
            <Skeleton className="h-8 w-16 rounded-bp" />
            <Skeleton className="h-8 w-20 rounded-bp" />
            <Skeleton className="h-9 w-28 rounded-bp" />
          </div>
        </div>
      </div>
      <div className="grid gap-0 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam shadow-bp lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.9fr)] lg:min-h-[640px]">
        <div className="relative flex min-h-[420px] flex-col lg:min-h-[640px]">
          <div className="relative min-h-[320px] flex-1 bg-mist lg:min-h-0">
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="absolute left-4 top-4 space-y-2">
              <Skeleton className="h-6 w-24 rounded-bp" />
              <Skeleton className="h-6 w-16 rounded-bp" />
            </div>
          </div>
          {/* Mode filter craft residual — azure Mode rail · mist chips · generate CTA (BEA-462) */}
          <div className="border-t border-[color:var(--bp-line)] bg-foam/95">
            <div className="flex items-baseline gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 pt-2.5 pb-1.5 shadow-[inset_3px_0_0_var(--bp-river)]">
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="h-5 w-20 rounded-bp-xs" />
            </div>
            <div className="flex flex-wrap items-end gap-3 px-4 pb-3 pt-1.5">
              <div className="inline-flex gap-0.5 rounded-bp-sm bg-mist/50 p-1">
                <Skeleton className="h-8 w-16 rounded-bp-xs" />
                <Skeleton className="h-8 w-20 rounded-bp-xs" />
                <Skeleton className="h-8 w-16 rounded-bp-xs" />
              </div>
              <Skeleton className="h-10 w-28 rounded-bp" />
            </div>
          </div>
        </div>
        <aside className="flex flex-col border-t border-[color:var(--bp-line)] lg:border-l lg:border-t-0">
          {/* Stop drawer SoftFail depth — Itinerary rail · SoftFailNotice mist band (BEA-343) */}
          <div className="border-b border-[color:var(--bp-line)] bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-2.5 w-40" />
              </div>
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-5 w-12 rounded-bp-xs" />
                <Skeleton className="h-5 w-16 rounded-bp-xs" />
              </div>
            </div>
            {/* SoftFailNotice mist band under azure Itinerary rail — softSupport depth */}
            <Skeleton className="h-9 w-full rounded-none" />
          </div>
          {/* Day tabs chrome — azure Days rail · mist underline (BEA-247) */}
          <div className="border-b border-[color:var(--bp-line)] bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]">
            <div className="flex items-center justify-between gap-2 px-4 pt-2.5 pb-1.5">
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-2.5 w-10" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-2.5 w-40" />
              </div>
              <Skeleton className="h-5 w-16 rounded-bp-xs" />
            </div>
            <div className="flex gap-0 bg-mist/40 px-2 pb-3 pt-1">
              <Skeleton className="mx-1 h-14 w-24 rounded-bp-sm" />
              <Skeleton className="mx-1 h-14 w-24 rounded-bp-sm" />
              <Skeleton className="mx-1 h-14 w-24 rounded-bp-sm" />
            </div>
          </div>
          {/* Day scrub chrome — azure inset rail · river eyebrow · tip-011 track (BEA-452) */}
          <div className="border-b border-[color:var(--bp-line)] bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="px-4 pb-3 pt-2">
              <Skeleton className="h-10 w-full rounded-bp-sm" />
            </div>
          </div>
          {/* Stop chips SoftFail depth — azure Stops rail · Soft stops · SoftFail mist band (BEA-367) */}
          <div className="border-b border-[color:var(--bp-line)] bg-paper/70 shadow-[inset_3px_0_0_var(--bp-river)]">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-2.5 w-12" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-36" />
              </div>
              <Skeleton className="h-5 w-16 rounded-bp-xs" />
            </div>
            {/* SoftFailNotice mist band under azure Stops rail — softSupport depth */}
            <Skeleton className="h-9 w-full rounded-none" />
            {/* tip-011 mist-wash chip track while SoftFail owns depth */}
            <div className={`${softFailMistWashClass} px-4 pb-2.5 pt-1`}>
              <div className="flex gap-0.5 rounded-bp-sm bg-mist/70 p-1 shadow-[inset_3px_0_0_var(--bp-river)]">
                <Skeleton className="h-8 w-24 rounded-bp-xs" />
                <Skeleton className="h-8 w-20 rounded-bp-xs" />
                <Skeleton className="h-8 w-28 rounded-bp-xs" />
              </div>
            </div>
          </div>
          {/* tip-011 mist-wash empty body while SoftFail owns depth */}
          <div className={`space-y-3 ${softFailMistWashClass} px-5 py-10`}>
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-8 w-48 max-w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="mt-2 h-10 w-36 rounded-bp" />
          </div>
        </aside>
      </div>
    </div>
  );
}

export function JournalSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="relative mx-auto max-w-5xl px-4 pb-24 pt-4 md:px-8 md:pt-8"
    >
      <div className="space-y-4 border-b border-[color:var(--bp-line)] pb-8">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-7 w-20 rounded-bp-sm" />
          <Skeleton className="h-7 w-16 rounded-bp-sm" />
        </div>
      </div>
      <div className="mt-8 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam shadow-bp">
        {/* Day strip chrome — azure inset · paper/70 (BEA-496) */}
        <div className="flex gap-1 border-b border-[color:var(--bp-line)] bg-paper/70 p-1 shadow-[inset_3px_0_0_var(--bp-river)]">
          <Skeleton className="h-12 w-24 rounded-bp-sm" />
          <Skeleton className="h-12 w-24 rounded-bp-sm" />
          <Skeleton className="h-12 w-24 rounded-bp-sm" />
        </div>
        {/* Day scrub SoftFail depth — azure rail · Soft badge · SoftFail mist band · tip-011 mist track */}
        <div className="border-b border-[color:var(--bp-line)] bg-mist/35 shadow-[inset_3px_0_0_var(--bp-river)]">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-14 rounded-bp-xs" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-none border-b border-[color:var(--bp-line)]" />
          <div className={`${softFailMistWashClass} px-4 pb-3 pt-2`}>
            <Skeleton className="h-10 w-full rounded-bp-sm" />
          </div>
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.85fr)]">
          <div className="space-y-0 px-5 py-6 md:px-7">
            {/* Entry empty SoftFail depth — azure rail · Soft empty badge · mist SoftFail band · empty body */}
            <div className="space-y-2 border-b border-[color:var(--bp-line)] bg-paper/55 pb-5 shadow-[inset_3px_0_0_var(--bp-river)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-2.5 w-44" />
                </div>
                <Skeleton className="h-5 w-16 rounded-bp-xs" />
              </div>
              <Skeleton className="h-9 w-56 max-w-[80%]" />
              <Skeleton className="h-3.5 w-52" />
            </div>
            <Skeleton className="h-9 w-full rounded-none border-b border-[color:var(--bp-line)]" />
            <div className="mt-6 space-y-3 rounded-bp-sm bg-mist/25 px-3 py-8 shadow-[inset_3px_0_0_var(--bp-river)] sm:px-4">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-8 w-56 max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <Skeleton className="mt-2 h-11 w-36 rounded-bp" />
              <div className="mt-4 grid max-w-sm grid-cols-3 gap-3">
                <Skeleton className="aspect-[3/4] w-full rounded-bp-sm" />
                <Skeleton className="aspect-[3/4] w-full rounded-bp-sm" />
                <Skeleton className="aspect-[3/4] w-full rounded-bp-sm" />
              </div>
            </div>
          </div>
          <div className="hidden border-l border-[color:var(--bp-line)] bg-paper/50 lg:block">
            {/* Compose SoftFail depth — azure rail · softSupport · SoftFail mist band · mist tip-011 body */}
            <div className="space-y-2 border-b border-[color:var(--bp-line)] px-5 py-4 md:px-6 shadow-[inset_3px_0_0_var(--bp-river)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-36" />
                </div>
                <Skeleton className="h-4 w-14 rounded-bp-xs" />
              </div>
              <Skeleton className="h-3.5 w-full" />
            </div>
            {/* SoftFailNotice mist band under azure Compose rail */}
            <Skeleton className="h-9 w-full rounded-none border-b border-[color:var(--bp-line)]" />
            <div className={`${softFailMistWashClass} p-5 md:p-6`}>
              <Skeleton className="h-9 w-full rounded-bp-sm" />
              <Skeleton className="mt-4 h-28 w-full rounded-bp-sm" />
              {/* Photo strip chrome — SoftFail yields while compose SoftFail owns */}
              <div className="mt-4 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)]">
                <div className="flex items-center justify-between border-b border-[color:var(--bp-line)] px-3.5 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)]">
                  <div className="flex items-baseline gap-2">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-4 w-14 rounded-bp-xs" />
                </div>
                <div>
                  <Skeleton className="mx-3.5 mt-3 h-16 w-[calc(100%-1.75rem)] rounded-bp-sm" />
                  <div className="mt-3 flex gap-2 px-3.5 pb-3">
                    <Skeleton className="h-[6.25rem] w-[4.5rem] shrink-0 rounded-bp-sm" />
                    <Skeleton className="h-[5.5rem] w-16 shrink-0 rounded-bp-sm" />
                    <Skeleton className="h-[5.5rem] w-16 shrink-0 rounded-bp-sm" />
                  </div>
                </div>
              </div>
              <Skeleton className="mt-4 h-11 w-full rounded-bp" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShareStudioSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto max-w-6xl px-4 pb-20 pt-4 md:px-8 md:pt-8"
    >
      <div className="space-y-3 border-b border-[color:var(--bp-line)] pb-8">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="mt-6 flex gap-2 border-b border-[color:var(--bp-line)] pb-0">
        <Skeleton className="h-14 w-28 rounded-none" />
        <Skeleton className="h-14 w-28 rounded-none" />
        <Skeleton className="h-14 w-28 rounded-none" />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(280px,0.7fr)]">
        <div className="flex flex-col items-center">
          {/* Canvas empty chrome — azure rail · SoftFailNotice slot · empty frame */}
          <div className="w-full max-w-[440px] space-y-0 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-mist/40 p-4 md:p-5">
            <div className="flex items-center justify-between gap-2 pl-2">
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-5 w-12 rounded-bp-xs" />
            </div>
            <Skeleton className="mt-0 h-9 w-full rounded-none" />
            <Skeleton className="mt-3 aspect-[9/16] w-full max-w-[400px] rounded-bp" />
          </div>
          <Skeleton className="mt-4 h-4 w-56" />
        </div>
        {/* Control sheet SoftFail depth — azure rail · SoftFail · mist tip-011 body */}
        <div className="overflow-hidden rounded-bp border border-[color:var(--bp-line)] bg-foam shadow-bp-soft">
          <div className="relative flex items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-4 py-2.5 shadow-[inset_3px_0_0_var(--bp-river)] sm:px-5">
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-5 w-14 rounded-bp-xs" />
          </div>
          {/* SoftFailNotice mist band under Studio rail */}
          <Skeleton className="h-9 w-full rounded-none" />
          <div className={`space-y-3 ${softFailMistWashClass} px-4 py-4`}>
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-3.5 w-full max-w-xs" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[8.5rem] w-full rounded-bp" />
              ))}
            </div>
            {/* Nested Export rail — azure inset · SoftFail slot · dual CTA heights */}
            <div className="mt-2 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft">
              <div className="relative flex items-end justify-between gap-3 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-3 shadow-[inset_3px_0_0_var(--bp-river)]">
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-2.5 w-12" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-3 w-40 max-w-full" />
                </div>
                <Skeleton className="h-5 w-12 rounded-bp-xs" />
              </div>
              <Skeleton className="h-9 w-full rounded-none" />
              <div className="flex flex-col gap-3 px-3 py-3">
                <Skeleton className="h-12 w-full rounded-bp" />
                <Skeleton className="h-11 w-full rounded-bp" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Tip 017 — dual-lens stage placeholder while camera / vision warms.
 * Frameless: nests under Live dual foam section (header + SoftFail band own the frame).
 */
export function DualCameraSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="grid md:grid-cols-2">
        <div className="relative min-h-[240px] border-b border-[color:var(--bp-line)] bg-mist md:min-h-[340px] md:border-b-0 md:border-r">
          <Skeleton className="absolute inset-0 rounded-none" />
          <div className="absolute left-3 top-3">
            <Skeleton className="h-6 w-28 rounded-bp-xs" />
          </div>
        </div>
        <div className="relative min-h-[240px] bg-mist md:min-h-[340px]">
          <Skeleton className="absolute inset-0 rounded-none" />
          <div className="absolute left-3 top-3">
            <Skeleton className="h-6 w-32 rounded-bp-xs" />
          </div>
          <div className="absolute inset-x-3 bottom-3 space-y-2 rounded-bp bg-foam/70 p-3 ring-1 ring-[color:var(--bp-line)]">
            <Skeleton className="h-3 w-40 max-w-[70%]" />
            <Skeleton className="h-5 w-56 max-w-full" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-[color:var(--bp-line)] bg-paper/85 px-3 py-3">
        <Skeleton className="h-10 w-24 rounded-bp-sm" />
        <Skeleton className="h-10 w-28 rounded-bp-sm" />
        <Skeleton className="h-10 w-32 rounded-bp-sm" />
      </div>
    </div>
  );
}

/** Tip 017 — nested place intel sheet while Places soft-fetches. */
/** Layout-matched map place intel SoftFail chrome (azure inset · SoftFail slot · mist Snapshot). */
export function PlaceIntelSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mt-3 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
    >
      <div className="relative border-b border-[color:var(--bp-line)] bg-paper/80 px-3 py-2.5 pl-3.5 shadow-[inset_3px_0_0_var(--bp-river)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-16 rounded-bp-xs" />
              <Skeleton className="h-4 w-14 rounded-bp-xs" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="h-4 w-36 max-w-full" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
        </div>
      </div>
      {/* SoftFailNotice slot under azure rail (BEA-265) */}
      <div className="border-b border-[color:var(--bp-line)] bg-mist/40 px-4 py-2">
        <Skeleton className="h-3 w-full max-w-[92%]" />
      </div>
      <div className="divide-y divide-[color:var(--bp-line)]">
        <div className="space-y-2 bg-mist/25 px-3 py-3">
          <Skeleton className="h-2.5 w-14" />
          <div className="flex flex-wrap items-center gap-1.5 rounded-bp-sm bg-mist/50 p-1">
            <Skeleton className="h-7 w-14 rounded-bp-xs" />
            <Skeleton className="h-7 w-36 max-w-full rounded-bp-xs" />
          </div>
        </div>
        <div className="space-y-2 px-3 py-3">
          <Skeleton className="h-2.5 w-16" />
          <div className="flex gap-0.5 rounded-bp-sm bg-mist/50 p-1">
            <Skeleton className="h-6 w-14 rounded-bp-xs" />
            <Skeleton className="h-6 w-16 rounded-bp-xs" />
            <Skeleton className="h-6 w-12 rounded-bp-xs" />
          </div>
        </div>
        <div className="space-y-2 px-3 py-3">
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-3.5 w-full max-w-[95%]" />
          <Skeleton className="h-3.5 w-[80%] max-w-[80%]" />
        </div>
      </div>
    </div>
  );
}

/** Tip 017 — OTA offer rows while booking search soft-fetches. */
export function BookingOffersSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul
      aria-busy="true"
      aria-live="polite"
      className="space-y-2"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)]/80 bg-foam px-3 py-3 shadow-bp-soft"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-14 rounded-bp-xs" />
              <Skeleton className="h-5 w-48 max-w-[85%]" />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:min-w-[7.5rem]">
              <Skeleton className="h-8 w-24 rounded-bp" />
              <Skeleton className="h-8 w-20 rounded-bp-sm" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Tip 017 — transit panel SoftFail depth (BEA-378) + craft residual (BEA-462):
 * azure Transfer rail · SoftFail mist band · tip-011 mist-wash summary/steps.
 */
export function TransferStepsSkeleton({ steps = 3 }: { steps?: number }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="animate-fade mt-2.5 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
    >
      {/* Transfer SoftFail depth — azure rail · Soft transfer · SoftFail mist band (BEA-378) */}
      <div className="relative border-b border-[color:var(--bp-line)] bg-mist/35 px-3 py-2 shadow-[inset_3px_0_0_var(--bp-river)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-14 rounded-bp-xs" />
            <Skeleton className="h-5 w-16 rounded-bp-xs" />
          </div>
          <Skeleton className="h-3.5 w-28" />
        </div>
        <Skeleton className="mt-1 h-2.5 w-48 max-w-[80%]" />
      </div>
      {/* SoftFailNotice mist band under azure Transfer rail */}
      <Skeleton className="h-9 w-full rounded-none" />
      <div className={`divide-y divide-[color:var(--bp-line)] ${softFailMistWashClass}`}>
        <div className="space-y-2 px-3 py-3">
          <Skeleton className="h-2.5 w-12" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-14 rounded-bp-xs" />
            <Skeleton className="h-4 w-44 max-w-[70%]" />
          </div>
        </div>
        <ol className="space-y-3 px-3 py-3">
          <Skeleton className="h-2.5 w-10" />
          {Array.from({ length: steps }).map((_, i) => (
            <li key={i} className="flex gap-3">
              <Skeleton className="mt-0.5 h-6 w-6 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3.5 w-12" />
                </div>
                <Skeleton className="h-4 w-40 max-w-[85%]" />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Tip 017 — day-fill draft preview while propose soft-runs. */
export function DayFillSkeleton({ days = 3 }: { days?: number }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="animate-fade overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
    >
      <div className="relative flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-3 shadow-[inset_3px_0_0_var(--bp-river)]">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-56 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 rounded-bp" />
      </div>
      <ol className="divide-y divide-[color:var(--bp-line)]">
        {Array.from({ length: days }).map((_, i) => (
          <li key={i} className="px-3 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-28 max-w-[50%] rounded-bp-xs" />
            </div>
            <div className="mt-2.5 space-y-2">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-40 max-w-[70%]" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-32 max-w-[60%]" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Tip 017 — status chip placeholders while translation BFF warms. */
export function TranslateStatusSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex flex-wrap items-center gap-2"
    >
      <Skeleton className="h-7 w-24 rounded-bp-xs" />
      <Skeleton className="h-7 w-28 rounded-bp-xs" />
      <Skeleton className="h-7 w-20 rounded-bp-xs" />
      <Skeleton className="h-7 w-28 rounded-bp-xs" />
      <Skeleton className="h-7 w-24 rounded-bp-xs" />
    </div>
  );
}

/**
 * Tip 017 — conversation history rows while a turn is in flight.
 * `emptySoft` paints mist-wash empty body under SoftFailNotice (BEA-310).
 */
export function TranslateHistorySkeleton({
  rows = 2,
  emptySoft = false,
}: {
  rows?: number;
  emptySoft?: boolean;
}) {
  if (emptySoft) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className="max-w-lg space-y-3 rounded-bp-sm bg-mist/25 px-5 py-10 shadow-[inset_3px_0_0_var(--bp-river)] md:px-6"
      >
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <div className="mt-2 flex flex-wrap gap-3">
          <Skeleton className="h-11 w-36 rounded-bp" />
          <Skeleton className="h-11 w-32 rounded-bp-sm" />
        </div>
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="divide-y divide-[color:var(--bp-line)]"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-3 px-5 py-5 md:grid-cols-2 md:px-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-14 rounded-bp-xs" />
            <Skeleton className="h-4 w-full max-w-[90%]" />
            <Skeleton className="h-4 w-40 max-w-[70%]" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16 rounded-bp-xs" />
            <Skeleton className="h-6 w-full max-w-[85%]" />
            <Skeleton className="h-6 w-48 max-w-[55%]" />
          </div>
        </div>
      ))}
    </div>
  );
}
