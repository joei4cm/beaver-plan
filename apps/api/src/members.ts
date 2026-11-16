import { Hono } from "hono";
import {
  generateInviteCode,
  inviteIsActive,
  invitePath,
  type AcceptInviteInput,
  type CreateInviteInput,
  type TripInvite,
  type TripMember,
  type TripRole,
} from "@beaver/core";
import type { AuthVariables } from "./auth.js";
import { requireAuth } from "./auth.js";
import {
  assertCanEdit,
  assertCanManage,
  assertCanView,
  publicWebOrigin,
} from "./access.js";
import type { Bindings } from "./env.js";
import {
  inviteCodesByTrip,
  invitesByCode,
  listMembers,
  nowIso,
  removeMember,
  saveInvite,
  trips,
  upsertMember,
} from "./store.js";

export const memberRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

memberRoutes.get("/v1/trips/:id/members", (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  // Public sample remains listable without a session (planner demo).
  if (trip.id !== "sample-kyoto") {
    const access = assertCanView(c, trip.id);
    if (!access.ok) return access.res;
  }
  const auth = c.get("auth");
  const members = listMembers(trip.id);
  const yourRole =
    members.find((m) => m.userId === auth?.userId)?.role ??
    (trip.id === "sample-kyoto" && auth?.userId === "demo-user"
      ? "owner"
      : trip.id === "sample-kyoto"
        ? "editor"
        : null);
  return c.json({
    members,
    tripVersion: trip.version,
    yourRole,
  });
});

memberRoutes.post("/v1/trips/:id/invites", requireAuth, async (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;
  // Editors may mint editor/viewer invites; only owner can mint editor if we want stricter —
  // keep simple: editor+ can invite as editor|viewer.
  let body: CreateInviteInput = {};
  try {
    body = await c.req.json<CreateInviteInput>();
  } catch {
    body = {};
  }
  const role: Exclude<TripRole, "owner"> =
    body.role === "viewer" ? "viewer" : "editor";

  let code = generateInviteCode();
  while (invitesByCode.has(code)) code = generateInviteCode();

  const stamp = nowIso();
  const invite: TripInvite = {
    id: crypto.randomUUID(),
    tripId: trip.id,
    code,
    role,
    createdBy: access.auth.userId,
    createdAt: stamp,
    expiresAt:
      typeof body.expiresInHours === "number" && body.expiresInHours > 0
        ? new Date(Date.now() + body.expiresInHours * 3600_000).toISOString()
        : undefined,
    maxUses: body.maxUses,
    useCount: 0,
  };
  saveInvite(invite);

  const origin = publicWebOrigin(c.env, c.req.url);
  const path = invitePath(code);
  return c.json(
    {
      invite,
      code,
      inviteUrl: `${origin}${path}`,
      path,
    },
    201,
  );
});

memberRoutes.get("/v1/trips/:id/invites", requireAuth, (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;
  const codes = inviteCodesByTrip.get(trip.id) ?? [];
  const invites = codes
    .map((code) => invitesByCode.get(code))
    .filter((x): x is TripInvite => Boolean(x));
  return c.json({ invites });
});

memberRoutes.post("/v1/trips/:id/invites/:code/revoke", requireAuth, (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanManage(c, trip.id);
  if (!access.ok) return access.res;
  const invite = invitesByCode.get(c.req.param("code").toUpperCase());
  if (!invite || invite.tripId !== trip.id) {
    return c.json({ error: "invite_not_found" }, 404);
  }
  const next = { ...invite, revokedAt: nowIso() };
  saveInvite(next);
  return c.json({ invite: next });
});

memberRoutes.patch("/v1/trips/:id/members/:userId", requireAuth, async (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanManage(c, trip.id);
  if (!access.ok) return access.res;

  let body: { role?: TripRole };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (body.role !== "editor" && body.role !== "viewer" && body.role !== "owner") {
    return c.json({ error: "invalid_role" }, 400);
  }

  const targetId = c.req.param("userId");
  const members = listMembers(trip.id);
  const target = members.find((m) => m.userId === targetId);
  if (!target) return c.json({ error: "member_not_found" }, 404);

  if (target.role === "owner" && body.role !== "owner") {
    const owners = members.filter((m) => m.role === "owner");
    if (owners.length <= 1) {
      return c.json({ error: "last_owner" }, 400);
    }
  }

  const updated = upsertMember({ ...target, role: body.role });
  return c.json({ member: updated });
});

memberRoutes.delete("/v1/trips/:id/members/:userId", requireAuth, (c) => {
  const trip = trips.get(c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = assertCanManage(c, trip.id);
  if (!access.ok) return access.res;

  const targetId = c.req.param("userId");
  const members = listMembers(trip.id);
  const target = members.find((m) => m.userId === targetId);
  if (!target) return c.json({ error: "member_not_found" }, 404);
  if (target.role === "owner") {
    const owners = members.filter((m) => m.role === "owner");
    if (owners.length <= 1) {
      return c.json({ error: "last_owner" }, 400);
    }
  }
  removeMember(trip.id, targetId);
  return c.json({ ok: true });
});

/** Public preview — no auth required. */
memberRoutes.get("/v1/invites/:code", (c) => {
  const code = c.req.param("code").toUpperCase();
  const invite = invitesByCode.get(code);
  if (!invite || !inviteIsActive(invite)) {
    return c.json({ error: "invite_invalid" }, 404);
  }
  const trip = trips.get(invite.tripId);
  if (!trip) return c.json({ error: "trip_not_found" }, 404);
  return c.json({
    code: invite.code,
    role: invite.role,
    trip: {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
    },
    active: true,
  });
});

memberRoutes.post("/v1/invites/:code/accept", requireAuth, async (c) => {
  const code = c.req.param("code").toUpperCase();
  const invite = invitesByCode.get(code);
  if (!invite || !inviteIsActive(invite)) {
    return c.json({ error: "invite_invalid" }, 404);
  }
  const trip = trips.get(invite.tripId);
  if (!trip) return c.json({ error: "trip_not_found" }, 404);

  const auth = c.get("auth")!;
  let body: AcceptInviteInput = {};
  try {
    body = await c.req.json<AcceptInviteInput>();
  } catch {
    body = {};
  }

  const existing = listMembers(trip.id).find((m) => m.userId === auth.userId);
  if (existing) {
    return c.json({
      member: existing,
      trip,
      alreadyMember: true,
    });
  }

  const member: TripMember = {
    id: crypto.randomUUID(),
    tripId: trip.id,
    userId: auth.userId,
    role: invite.role,
    displayName: body.displayName?.trim() || auth.displayName,
    joinedAt: nowIso(),
  };
  upsertMember(member);
  saveInvite({ ...invite, useCount: invite.useCount + 1 });

  return c.json({ member, trip, alreadyMember: false }, 201);
});
