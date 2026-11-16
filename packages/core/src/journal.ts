import type { JournalEntry } from "./domain.js";

/** Entries for a day (includes stop-scoped notes that day). */
export function journalForDay(
  entries: JournalEntry[],
  dayId: string,
  stopIds: string[] = [],
): JournalEntry[] {
  const stopSet = new Set(stopIds);
  return entries
    .filter(
      (e) =>
        e.dayId === dayId || (e.stopId !== undefined && stopSet.has(e.stopId)),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function journalForStop(
  entries: JournalEntry[],
  stopId: string,
): JournalEntry[] {
  return entries
    .filter((e) => e.stopId === stopId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Flatten media URLs from selected journal entries (deduped, order preserved). */
export function collectJournalPhotos(
  entries: JournalEntry[],
  limit = 6,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const url of entry.media) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
