import {
  bumpTripVersion,
  canEditTrip,
  canManageMembers,
  canViewTrip,
  memberForUser,
  type Trip,
  type TripMember,
  type TripRole,
} from "@beaver/core";
import type { Context } from "hono";
import type { AuthUser, AuthVariables } from "./auth.js";
import { clerkConfigured } from "./auth.js";
import type { Db } from "./db/client.js";
import { dbOf } from "./db/context.js";
import type { Bindings } from "./env.js";
import { listMembers, nowIso, updateTrip } from "./store.js";

type AppContext = Context<{ Bindings: Bindings; Variables: AuthVariables }>;

export function publicWebOrigin(env: Bindings, requestUrl: string): string {
  if (env.PUBLIC_WEB_ORIGIN?.trim()) {
    return env.PUBLIC_WEB_ORIGIN.trim().replace(/\/$/, "");
  }
  try {
    const u = new URL(requestUrl);
    if (u.port === "8787") return "http://localhost:3000";
  } catch {
    /* ignore */
  }
  return "http://localhost:3000";
}

export async function tripMember(
  db: Db,
  tripId: string,
  userId: string | undefined,
): Promise<TripMember | undefined> {
  if (!userId) return undefined;
  return memberForUser(await listMembers(db, tripId), userId);
}

/**
 * Reads: open in demo mode; with Clerk, require membership (or still allow
 * GET sample reads — handled by callers if needed).
 */
export async function assertCanView(
  c: AppContext,
  tripId: string,
): Promise<
  { ok: true; role?: TripRole; auth: AuthUser | null } | { ok: false; res: Response }
> {
  const auth = c.get("auth");
  const member = await tripMember(dbOf(c), tripId, auth?.userId);
  if (!clerkConfigured(c.env)) {
    return { ok: true, role: member?.role ?? "editor", auth };
  }
  if (!auth) {
    return {
      ok: false,
      res: c.json({ error: "unauthorized" }, 401),
    };
  }
  if (!canViewTrip(member?.role)) {
    return {
      ok: false,
      res: c.json({ error: "forbidden", hint: "not_a_member" }, 403),
    };
  }
  return { ok: true, role: member!.role, auth };
}

export async function assertCanEdit(
  c: AppContext,
  tripId: string,
): Promise<
  | { ok: true; role: TripRole; auth: AuthUser; member: TripMember }
  | { ok: false; res: Response }
> {
  const auth = c.get("auth");
  if (!auth) {
    return {
      ok: false,
      res: c.json(
        {
          error: "unauthorized",
          hint: clerkConfigured(c.env)
            ? "Pass Authorization: Bearer <Clerk session JWT>"
            : "Pass X-Beaver-User-Id",
        },
        401,
      ),
    };
  }

  const db = dbOf(c);
  const members = await listMembers(db, tripId);
  let member = memberForUser(members, auth.userId);

  // Demo convenience: first writer on an empty membership list becomes owner.
  if (!clerkConfigured(c.env) && !member && members.length === 0) {
    member = {
      id: crypto.randomUUID(),
      tripId,
      userId: auth.userId,
      role: "owner",
      displayName: auth.displayName,
      joinedAt: nowIso(),
    };
  }

  // Demo sample trips remain editable without Clerk keys.
  if (!clerkConfigured(c.env) && !member) {
    member = {
      id: "demo-ephemeral",
      tripId,
      userId: auth.userId,
      role: "editor",
      displayName: auth.displayName,
      joinedAt: nowIso(),
    };
  }

  if (!canEditTrip(member?.role)) {
    return {
      ok: false,
      res: c.json(
        {
          error: "forbidden",
          hint: member ? "viewer_cannot_edit" : "not_a_member",
          role: member?.role,
        },
        403,
      ),
    };
  }

  return { ok: true, role: member!.role, auth, member: member! };
}

export async function assertCanManage(
  c: AppContext,
  tripId: string,
): Promise<
  | { ok: true; auth: AuthUser; member: TripMember }
  | { ok: false; res: Response }
> {
  const auth = c.get("auth");
  if (!auth) {
    return {
      ok: false,
      res: c.json({ error: "unauthorized" }, 401),
    };
  }
  const member = await tripMember(dbOf(c), tripId, auth.userId);
  if (!canManageMembers(member?.role)) {
    return {
      ok: false,
      res: c.json({ error: "forbidden", hint: "owner_required" }, 403),
    };
  }
  return { ok: true, auth, member: member! };
}

export async function applyVersionOrConflict(
  c: AppContext,
  trip: Trip,
  expectedVersion: number | undefined,
): Promise<{ ok: true; trip: Trip } | { ok: false; res: Response }> {
  const result = bumpTripVersion(trip, expectedVersion, nowIso());
  if (!result.ok) {
    return {
      ok: false,
      res: c.json(
        {
          error: "version_conflict",
          serverVersion: result.serverVersion,
          message: "Trip changed — refresh and retry",
        },
        409,
      ),
    };
  }
  const next = result.trip!;
  await updateTrip(dbOf(c), next);
  return { ok: true, trip: next };
}

export function parseExpectedVersion(body: {
  expectedVersion?: number;
  version?: number;
}): number | undefined {
  if (typeof body.expectedVersion === "number") return body.expectedVersion;
  if (typeof body.version === "number") return body.version;
  return undefined;
}
