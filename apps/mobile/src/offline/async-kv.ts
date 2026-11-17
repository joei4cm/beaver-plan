import type { KvStore } from "@beaver/offline";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** AsyncStorage adapter — SQLite-lite persistence for Expo. */
export function createAsyncKv(): KvStore {
  return {
    async get(key) {
      return AsyncStorage.getItem(key);
    },
    async set(key, value) {
      await AsyncStorage.setItem(key, value);
    },
    async delete(key) {
      await AsyncStorage.removeItem(key);
    },
    async keys(prefix) {
      const all = await AsyncStorage.getAllKeys();
      if (!prefix) return [...all];
      return all.filter((k) => k.startsWith(prefix));
    },
  };
}
