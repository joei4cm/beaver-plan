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

/**
 * Match `@Display Name` tokens against known member display names.
 * Longer names win so `@Demo Traveler` beats `@Demo`.
 */
export function parseMentions(
  body: string,
  memberDisplayNames: string[],
): string[] {
  const names = [
    ...new Set(
      memberDisplayNames
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .sort((a, b) => b.length - a.length),
    ),
  ];
  if (names.length === 0 || !body.includes("@")) return [];

  const covered = new Array<boolean>(body.length).fill(false);
  const found = new Set<string>();
  for (const name of names) {
    const needle = `@${name}`;
    let from = 0;
    while (from < body.length) {
      const idx = body.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      const alreadyCovered = covered.slice(idx, end).some(Boolean);
      if (!alreadyCovered) {
        const before = idx === 0 ? " " : body[idx - 1]!;
        const after = end >= body.length ? " " : body[end]!;
        const boundaryBefore = !/[\w\u4e00-\u9fff]/.test(before);
        const boundaryAfter = !/[\w\u4e00-\u9fff]/.test(after);
        if (boundaryBefore && boundaryAfter) {
          found.add(name);
          for (let i = idx; i < end; i += 1) covered[i] = true;
        }
      }
      from = idx + 1;
    }
  }
  return [...found];
}

/** Viewer cannot mutate; editor+ can comment / invite / edit. */
export function canCommentOnTrip(role: TripRole | undefined): boolean {
  return canEditTrip(role);
}
