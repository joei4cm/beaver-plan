type SkeletonProps = {
  className?: string;
};

/** Tip 017 — placeholder shape; band is drawn by `.bp-skeleton`. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`bp-skeleton ${className}`}
    />
  );
}

export function TripsListSkeleton() {
  return (
    <ul aria-busy="true" aria-live="polite" className="space-y-0">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="border-t border-[color:var(--bp-line)] py-6 last:border-b"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="flex items-baseline gap-4">
            <Skeleton className="hidden h-8 w-10 sm:block" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-6 w-48 max-w-[70%]" />
              <Skeleton className="h-3.5 w-64 max-w-[90%]" />
            </div>
            <Skeleton className="hidden h-8 w-20 sm:block" />
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
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 border-b border-[color:var(--bp-line)] pb-6">
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
        <Skeleton className="hidden h-72 rounded-bp lg:block" />
      </div>
    </div>
  );
}
