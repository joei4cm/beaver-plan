import { offlinePhraseTranslate } from "./phrasebook.js";
import { normalizePair, type LanguagePair } from "./types.js";

/** Queued phrase when the device is offline or live translate fails. */
export type QueuedTranslation = {
  id: string;
  createdAt: string;
  text: string;
  pair: LanguagePair;
  /** Phrasebook hit when available — shown immediately offline. */
  offlineHint?: {
    translatedText: string;
    phraseId: string;
  };
  status: "queued" | "flushed" | "failed";
  lastError?: string;
};

export type OfflineQueueStore = {
  load(): Promise<QueuedTranslation[]>;
  save(items: QueuedTranslation[]): Promise<void>;
};

function newId(): string {
  return `tq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Enqueue text for later online translate; attach phrasebook hint if any. */
export async function enqueueTranslation(
  store: OfflineQueueStore,
  input: {
    text: string;
    sourceLocale: string;
    targetLocale: string;
  },
): Promise<QueuedTranslation> {
  const text = input.text.trim();
  if (!text) throw new Error("text_required");
  const pair = normalizePair(input.sourceLocale, input.targetLocale);
  const hit = offlinePhraseTranslate(text, pair.sourceLocale, pair.targetLocale);
  const item: QueuedTranslation = {
    id: newId(),
    createdAt: new Date().toISOString(),
    text,
    pair,
    offlineHint: hit
      ? { translatedText: hit.translatedText, phraseId: hit.id }
      : undefined,
    status: "queued",
  };
  const items = await store.load();
  items.unshift(item);
  await store.save(items.slice(0, 100));
  return item;
}

export async function listQueuedTranslations(
  store: OfflineQueueStore,
): Promise<QueuedTranslation[]> {
  return store.load();
}

export async function markQueuedFlushed(
  store: OfflineQueueStore,
  id: string,
): Promise<void> {
  const items = await store.load();
  const next = items.map((item) =>
    item.id === id ? { ...item, status: "flushed" as const } : item,
  );
  await store.save(next.filter((i) => i.status === "queued").concat(
    next.filter((i) => i.status !== "queued").slice(0, 20),
  ));
}

export async function removeQueuedTranslation(
  store: OfflineQueueStore,
  id: string,
): Promise<void> {
  const items = await store.load();
  await store.save(items.filter((i) => i.id !== id));
}

export function pendingQueueCount(items: QueuedTranslation[]): number {
  return items.filter((i) => i.status === "queued").length;
}
