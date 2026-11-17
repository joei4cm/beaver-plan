import type { KvStore } from "@beaver/offline";

const DB_NAME = "beaver-plan-offline";
const STORE = "kv";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb_open_failed"));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("idb_op_failed"));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** IndexedDB key-value adapter for the web shell. */
export function createIdbKv(): KvStore {
  return {
    async get(key) {
      const value = await withStore("readonly", (store) => store.get(key));
      return typeof value === "string" ? value : value == null ? null : String(value);
    },
    async set(key, value) {
      await withStore("readwrite", (store) => store.put(value, key));
    },
    async delete(key) {
      await withStore("readwrite", (store) => store.delete(key));
    },
    async keys(prefix) {
      const all = await withStore<IDBValidKey[]>("readonly", (store) =>
        store.getAllKeys(),
      );
      const strings = all.map(String);
      if (!prefix) return strings;
      return strings.filter((k) => k.startsWith(prefix));
    },
  };
}
