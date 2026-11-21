type SkeletonProps = {
  className?: string;
};

/** Tip 017 — placeholder shape; band is drawn by `.bp-skeleton`. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div aria-hidden className={`bp-skeleton ${className}`} />;
}

/** Layout-matched trips index rows (number · title · meta · azure action). */
export function TripsListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-live="polite" className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="border-t border-[color:var(--bp-line)] py-6 last:border-b"
        >
          <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap sm:gap-6">
            <Skeleton className="h-8 w-10 shrink-0 md:h-9" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <Skeleton className="h-6 w-48 max-w-[70%]" />
              <Skeleton className="h-3.5 w-64 max-w-[90%]" />
            </div>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-8 w-24 rounded-bp" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Layout-matched city playbook rows. */
export function TemplatesListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-live="polite" className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="grid grid-cols-[auto_1fr] items-center gap-4 border-t border-[color:var(--bp-line)] py-7 last:border-b sm:grid-cols-[auto_1fr_auto] sm:gap-8"
        >
          <Skeleton className="h-10 w-12 shrink-0 md:h-12" />
          <div className="min-w-0 space-y-2.5">
            <Skeleton className="h-6 w-44 max-w-[75%]" />
            <Skeleton className="h-3.5 w-full max-w-md" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="col-span-2 flex gap-2 sm:col-span-1 sm:flex-col sm:items-stretch md:flex-row">
            <Skeleton className="h-9 w-24 rounded-bp" />
            <Skeleton className="h-9 w-28 rounded-bp" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PlannerSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto max-w-[1480px] px-3 pb-16 pt-2 md:px-6 lg:px-8 lg:pt-4"
    >
      <div className="mb-4 space-y-3 border-b border-[color:var(--bp-line)] pb-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-72 max-w-full" />
      </div>
      <div className="grid gap-0 overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam shadow-bp lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.9fr)] lg:min-h-[640px]">
        <div className="relative min-h-[420px] bg-[#EAF0F8] lg:min-h-[640px]">
          <Skeleton className="absolute inset-0 rounded-none" />
          <div className="absolute left-4 top-4 space-y-2">
            <Skeleton className="h-6 w-24 rounded-bp" />
            <Skeleton className="h-6 w-16 rounded-bp" />
          </div>
        </div>
        <aside className="flex flex-col border-t border-[color:var(--bp-line)] lg:border-l lg:border-t-0">
          <div className="flex gap-0 border-b border-[color:var(--bp-line)] bg-paper/60 px-2 py-3">
            <Skeleton className="mx-1 h-12 w-24 rounded-bp-sm" />
            <Skeleton className="mx-1 h-12 w-24 rounded-bp-sm" />
            <Skeleton className="mx-1 h-12 w-24 rounded-bp-sm" />
          </div>
          <div className="space-y-0 px-4 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex gap-3 border-b border-[color:var(--bp-line)] py-4"
              >
                <Skeleton className="mt-0.5 h-7 w-7 shrink-0 rounded-bp" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-[80%]" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
              </div>
            ))}
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
        <div className="flex gap-2 border-b border-[color:var(--bp-line)] bg-paper/60 px-3 py-3">
          <Skeleton className="h-12 w-24 rounded-bp-sm" />
          <Skeleton className="h-12 w-24 rounded-bp-sm" />
          <Skeleton className="h-12 w-24 rounded-bp-sm" />
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.85fr)]">
          <div className="space-y-6 px-5 py-6 md:px-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="space-y-3 border-b border-[color:var(--bp-line)] pb-6 last:border-b-0"
              >
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3.5 w-full max-w-lg" />
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <Skeleton className="aspect-[3/4] rounded-bp-sm" />
                  <Skeleton className="aspect-[3/4] rounded-bp-sm" />
                  <Skeleton className="aspect-[3/4] rounded-bp-sm" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden border-l border-[color:var(--bp-line)] bg-paper/50 p-5 lg:block">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="mt-3 h-3.5 w-full" />
            <Skeleton className="mt-6 h-24 w-full rounded-bp-sm" />
            <Skeleton className="mt-4 h-11 w-full rounded-bp" />
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
          <Skeleton className="aspect-[9/16] w-full max-w-[420px] rounded-bp-lg" />
          <Skeleton className="mt-4 h-4 w-56" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-7 w-36" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.5rem] w-full rounded-bp" />
          ))}
          <div className="mt-6 space-y-2.5 border-t border-[color:var(--bp-line)] pt-5">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3.5 w-full max-w-xs" />
            <Skeleton className="mt-1 h-12 w-full rounded-bp" />
            <Skeleton className="h-11 w-full rounded-bp" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tip 017 — dual-lens stage placeholder while camera / vision warms. */
export function DualCameraSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="overflow-hidden rounded-bp-lg border border-[color:var(--bp-line)] bg-foam shadow-bp"
    >
      <div className="grid md:grid-cols-2">
        <div className="relative min-h-[220px] border-b border-[color:var(--bp-line)] bg-[#EAF0F8] md:min-h-[320px] md:border-b-0 md:border-r">
          <Skeleton className="absolute inset-0 rounded-none" />
          <div className="absolute left-3 top-3">
            <Skeleton className="h-6 w-28 rounded-bp-xs" />
          </div>
        </div>
        <div className="relative min-h-[220px] bg-[#EAF0F8] md:min-h-[320px]">
          <Skeleton className="absolute inset-0 rounded-none" />
          <div className="absolute left-3 top-3">
            <Skeleton className="h-6 w-32 rounded-bp-xs" />
          </div>
          <div className="absolute inset-x-3 bottom-3 space-y-2 rounded-bp bg-foam/70 p-3">
            <Skeleton className="h-3 w-40 max-w-[70%]" />
            <Skeleton className="h-5 w-56 max-w-full" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-[color:var(--bp-line)] bg-paper/70 px-3 py-3">
        <Skeleton className="h-10 w-24 rounded-bp-sm" />
        <Skeleton className="h-10 w-28 rounded-bp-sm" />
        <Skeleton className="h-10 w-32 rounded-bp-sm" />
      </div>
    </div>
  );
}

/** Tip 017 — nested place intel sheet while Places soft-fetches. */
export function PlaceIntelSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mt-3 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-16 rounded-bp-xs" />
      </div>
      <div className="space-y-2.5 px-3 py-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-3.5 w-36 max-w-full" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-14 rounded-bp-xs" />
          <Skeleton className="h-5 w-16 rounded-bp-xs" />
          <Skeleton className="h-5 w-12 rounded-bp-xs" />
        </div>
        <Skeleton className="h-3.5 w-full max-w-[95%]" />
        <Skeleton className="h-3.5 w-[80%] max-w-[80%]" />
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
          className="overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)]/80 bg-paper/50 px-3 py-3"
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
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              <Skeleton className="h-8 w-24 rounded-bp" />
              <Skeleton className="h-8 w-20 rounded-bp-sm" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tip 017 — transfer step rails while route-day soft-runs. */
export function TransferStepsSkeleton({ steps = 3 }: { steps?: number }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="animate-fade mt-2.5 overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)] bg-foam shadow-bp-soft"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--bp-line)] bg-paper/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-14 rounded-bp-xs" />
        </div>
        <Skeleton className="h-3.5 w-28" />
      </div>
      <ol className="space-y-3 px-3 py-3">
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
  );
}

/** Tip 017 — day-fill draft preview while propose soft-runs. */
export function DayFillSkeleton({ days = 3 }: { days?: number }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="animate-fade space-y-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3.5 w-56 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 rounded-bp" />
      </div>
      <ol className="space-y-3">
        {Array.from({ length: days }).map((_, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-bp-sm border border-[color:var(--bp-line)]/80 bg-paper/50 px-3 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36 max-w-[50%]" />
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
      className="mt-5 flex flex-wrap items-center gap-2"
    >
      <Skeleton className="h-7 w-24 rounded-bp-xs" />
      <Skeleton className="h-7 w-28 rounded-bp-xs" />
      <Skeleton className="h-7 w-20 rounded-bp-xs" />
      <Skeleton className="h-7 w-28 rounded-bp-xs" />
      <Skeleton className="h-7 w-24 rounded-bp-xs" />
    </div>
  );
}
