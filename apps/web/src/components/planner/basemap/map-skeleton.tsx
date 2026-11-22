/** Lumen paper wash shown while basemap JS / first tiles load. */
export function MapSkeleton({ label = "Loading map" }: { label?: string }) {
  return (
    <div
      className="absolute inset-0 z-[1] flex items-center justify-center bg-mist"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-river/15 via-mist to-paper" />
      <div className="relative h-full w-full overflow-hidden opacity-40">
        <div className="absolute left-[12%] top-[18%] h-[1px] w-[76%] bg-mist" />
        <div className="absolute left-[18%] top-[38%] h-[1px] w-[64%] bg-mist" />
        <div className="absolute left-[8%] top-[58%] h-[1px] w-[84%] bg-mist" />
        <div className="absolute left-[28%] top-[12%] h-[76%] w-[1px] bg-mist" />
        <div className="absolute left-[52%] top-[8%] h-[84%] w-[1px] bg-mist" />
        <div className="absolute left-[72%] top-[20%] h-[60%] w-[1px] bg-mist" />
      </div>
      <span className="animate-rise relative rounded-bp bg-foam/90 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-soft shadow-bp-soft">
        {label}
      </span>
    </div>
  );
}
