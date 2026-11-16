import type {
  Trip,
  TripInvite,
  TripMember,
  TripRole,
} from "./domain.js";
import type { CollabSyncResult } from "./ports.js";

export type { CollabSyncResult } from "./ports.js";

const ROLE_RANK: Record<TripRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function roleAtLeast(role: TripRole, minimum: TripRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function canEditTrip(role: TripRole | undefined): boolean {
  return role !== undefined && roleAtLeast(role, "editor");
}

export function canManageMembers(role: TripRole | undefined): boolean {
  return role !== undefined && roleAtLeast(role, "owner");
}

export function canViewTrip(role: TripRole | undefined): boolean {
  return role !== undefined && roleAtLeast(role, "viewer");
}

/** Short human-friendly invite code, e.g. BP-7K2M9Q */
export function generateInviteCode(random: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let body = "";
  for (let i = 0; i < 6; i += 1) {
    body += alphabet[Math.floor(random() * alphabet.length)]!;
  }
  return `BP-${body}`;
}

export function inviteIsActive(
  invite: TripInvite,
  nowMs: number = Date.now(),
): boolean {
  if (invite.revokedAt) return false;
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= nowMs) return false;
  if (invite.maxUses !== undefined && invite.useCount >= invite.maxUses) {
    return false;
  }
  return true;
}

export function invitePath(code: string): string {
  return `/invite/${encodeURIComponent(code)}`;
}

/**
 * Optimistic concurrency: client sends expectedVersion; server bumps on success.
 * Mismatch → version_conflict (client should refresh).
 */
export function bumpTripVersion(
  trip: Trip,
  expectedVersion: number | undefined,
  stamp: string,
): CollabSyncResult & { trip?: Trip } {
  if (
    expectedVersion !== undefined &&
    expectedVersion !== null &&
    Number(expectedVersion) !== trip.version
  ) {
    return {
      ok: false,
      reason: "version_conflict",
      serverVersion: trip.version,
    };
  }
  const next: Trip = {
    ...trip,
    version: trip.version + 1,
    updatedAt: stamp,
  };
  return { ok: true, version: next.version, trip: next };
}

export function memberForUser(
  members: TripMember[],
  userId: string,
): TripMember | undefined {
  return members.find((m) => m.userId === userId);
}
