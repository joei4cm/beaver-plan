import type { OfflineQueueStore, QueuedTranslation } from "@beaver/core";

const KEY = "bp_translation_offline_queue_v1";

export function createWebOfflineQueueStore(): OfflineQueueStore {
  return {
    async load() {
      if (typeof window === "undefined") return [];
      try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as QueuedTranslation[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    async save(items) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(KEY, JSON.stringify(items));
    },
  };
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}
