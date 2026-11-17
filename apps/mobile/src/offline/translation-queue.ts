import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OfflineQueueStore, QueuedTranslation } from "@beaver/core";

const KEY = "bp_translation_offline_queue_v1";

export function createMobileOfflineQueueStore(): OfflineQueueStore {
  return {
    async load() {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as QueuedTranslation[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    async save(items) {
      await AsyncStorage.setItem(KEY, JSON.stringify(items));
    },
  };
}
