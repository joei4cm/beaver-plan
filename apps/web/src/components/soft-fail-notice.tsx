type Props = {
  children: string;
  className?: string;
  /** Tighter strip for planner sheet footers / nested panels. */
  compact?: boolean;
};

/**
 * One muted Lumen Route notice for demo / keys-missing / API-absent soft-fail.
 * Mist wash + ink-soft copy — never timber, never raw "Failed to fetch".
 * Fade (not sheet-in): SheetPresence owns sheet motion after #69.
 */
export function SoftFailNotice({ children, className, compact }: Props) {
  const base = compact
    ? "border-t border-[color:var(--bp-line)] bg-mist/40 px-4 py-2 text-xs leading-relaxed text-ink-soft"
    : "animate-fade rounded-bp-sm border border-[color:var(--bp-line)] bg-mist/50 px-4 py-3 text-sm leading-relaxed text-ink-soft";

  return (
    <p
      role="status"
      className={[base, className].filter(Boolean).join(" ")}
    >
      {children}
    </p>
  );
}
