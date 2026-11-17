export const OFFLINE_KEY_PREFIX = "beaver:offline:";

export function tripCacheKey(tripId: string): string {
  return `${OFFLINE_KEY_PREFIX}trip:${tripId}`;
}

export function queueKey(): string {
  return `${OFFLINE_KEY_PREFIX}queue`;
}

export function metaKey(): string {
  return `${OFFLINE_KEY_PREFIX}meta`;
}

export type OfflineMeta = {
  lastFlushAt?: string;
  lastFlushError?: string;
};
