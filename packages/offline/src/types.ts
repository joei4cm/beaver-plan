import type {
  CreateJournalInput,
  Day,
  JournalEntry,
  Leg,
  Stop,
  Trip,
} from "@beaver/core";

/** Lightweight map stub — stop pins + last-known route polylines (not vendor tiles). */
export type OfflineMapSnapshot = {
  stopPoints: Array<{
    id: string;
    lat: number;
    lng: number;
    name: string;
  }>;
  polylines: string[];
};

/** Device-local mirror of a pinned trip for offline read. */
export type CachedTripBundle = {
  tripId: string;
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
  journal: JournalEntry[];
  mapSnapshot: OfflineMapSnapshot;
  pinned: boolean;
  pinnedAt: string;
  cachedAt: string;
};

export type OfflinePinStatus = {
  tripId: string;
  pinned: boolean;
  pinnedAt?: string;
  cachedAt?: string;
  pendingMutations: number;
  online: boolean;
  lastFlushAt?: string;
  lastFlushError?: string;
};

export type PendingPhoto = {
  id: string;
  contentType: string;
  dataBase64: string;
};

export type JournalCreateMutation = {
  id: string;
  kind: "journal.create";
  tripId: string;
  createdAt: string;
  localEntryId: string;
  payload: CreateJournalInput;
  pendingPhotos: PendingPhoto[];
  expectedVersion?: number;
};

export type JournalDeleteMutation = {
  id: string;
  kind: "journal.delete";
  tripId: string;
  createdAt: string;
  entryId: string;
  expectedVersion?: number;
};

export type OfflineMutation = JournalCreateMutation | JournalDeleteMutation;

/** Minimal string KV used by IndexedDB / AsyncStorage adapters. */
export type KvStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
};

/** Network + API surface the sync flusher needs (provided by each app). */
export type OfflineSyncTransport = {
  isOnline(): boolean;
  uploadMedia(input: {
    tripId: string;
    contentType: string;
    dataBase64: string;
  }): Promise<{ key: string }>;
  createJournal(
    tripId: string,
    body: CreateJournalInput & { expectedVersion?: number },
  ): Promise<{ entry: JournalEntry; tripVersion?: number }>;
  deleteJournal(
    tripId: string,
    entryId: string,
    expectedVersion?: number,
  ): Promise<{ tripVersion?: number }>;
  /** Optional: refresh trip.version after a 409 for LWW retry. */
  fetchTripVersion?(tripId: string): Promise<number | undefined>;
};

export type FlushResult = {
  flushed: number;
  remaining: number;
  errors: string[];
  lastTripVersions: Record<string, number>;
};

export type VersionConflictError = {
  name: "VersionConflictError";
  serverVersion?: number;
  message: string;
};

export function isVersionConflictError(
  err: unknown,
): err is VersionConflictError {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "VersionConflictError"
  );
}

export function makeVersionConflictError(
  message: string,
  serverVersion?: number,
): VersionConflictError {
  return { name: "VersionConflictError", message, serverVersion };
}
