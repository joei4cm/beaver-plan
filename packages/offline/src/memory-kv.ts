import type { KvStore } from "./types.js";

/** In-memory KV for tests / Node environments without IndexedDB. */
export function createMemoryKv(): KvStore {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async keys(prefix) {
      const all = [...map.keys()];
      if (!prefix) return all;
      return all.filter((k) => k.startsWith(prefix));
    },
  };
}
