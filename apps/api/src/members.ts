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
import { dbOf } from "./db/context.js";
import type { Bindings } from "./env.js";
import {
  getInviteByCode,
  getTrip,
  inviteCodeExists,
  listInvites,
  listMembers,
  nowIso,
  removeMember,
  saveInvite,
  upsertMember,
} from "./store.js";

export const memberRoutes = new Hono<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();

memberRoutes.get("/v1/trips/:id/members", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  // Public sample remains listable without a session (planner demo).
  if (trip.id !== "sample-kyoto") {
    const access = await assertCanView(c, trip.id);
    if (!access.ok) return access.res;
  }
  const auth = c.get("auth");
  const members = await listMembers(db, trip.id);
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
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
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
  while (await inviteCodeExists(db, code)) code = generateInviteCode();

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
  await saveInvite(db, invite);

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

memberRoutes.get("/v1/trips/:id/invites", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanEdit(c, trip.id);
  if (!access.ok) return access.res;
  const invites = await listInvites(db, trip.id);
  return c.json({ invites });
});

memberRoutes.post("/v1/trips/:id/invites/:code/revoke", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanManage(c, trip.id);
  if (!access.ok) return access.res;
  const invite = await getInviteByCode(db, c.req.param("code"));
  if (!invite || invite.tripId !== trip.id) {
    return c.json({ error: "invite_not_found" }, 404);
  }
  const next = { ...invite, revokedAt: nowIso() };
  await saveInvite(db, next);
  return c.json({ invite: next });
});

memberRoutes.patch("/v1/trips/:id/members/:userId", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanManage(c, trip.id);
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
  const members = await listMembers(db, trip.id);
  const target = members.find((m) => m.userId === targetId);
  if (!target) return c.json({ error: "member_not_found" }, 404);

  if (target.role === "owner" && body.role !== "owner") {
    const owners = members.filter((m) => m.role === "owner");
    if (owners.length <= 1) {
      return c.json({ error: "last_owner" }, 400);
    }
  }

  const updated = await upsertMember(db, { ...target, role: body.role });
  return c.json({ member: updated });
});

memberRoutes.delete("/v1/trips/:id/members/:userId", requireAuth, async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const access = await assertCanManage(c, trip.id);
  if (!access.ok) return access.res;

  const targetId = c.req.param("userId");
  const members = await listMembers(db, trip.id);
  const target = members.find((m) => m.userId === targetId);
  if (!target) return c.json({ error: "member_not_found" }, 404);
  if (target.role === "owner") {
    const owners = members.filter((m) => m.role === "owner");
    if (owners.length <= 1) {
      return c.json({ error: "last_owner" }, 400);
    }
  }
  await removeMember(db, trip.id, targetId);
  return c.json({ ok: true });
});

/** Public preview — no auth required. */
memberRoutes.get("/v1/invites/:code", async (c) => {
  const db = dbOf(c);
  const code = c.req.param("code").toUpperCase();
  const invite = await getInviteByCode(db, code);
  if (!invite || !inviteIsActive(invite)) {
    return c.json({ error: "invite_invalid" }, 404);
  }
  const trip = await getTrip(db, invite.tripId);
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
  const db = dbOf(c);
  const code = c.req.param("code").toUpperCase();
  const invite = await getInviteByCode(db, code);
  if (!invite || !inviteIsActive(invite)) {
    return c.json({ error: "invite_invalid" }, 404);
  }
  const trip = await getTrip(db, invite.tripId);
  if (!trip) return c.json({ error: "trip_not_found" }, 404);

  const auth = c.get("auth")!;
  let body: AcceptInviteInput = {};
  try {
    body = await c.req.json<AcceptInviteInput>();
  } catch {
    body = {};
  }

  const existing = (await listMembers(db, trip.id)).find(
    (m) => m.userId === auth.userId,
  );
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
  await upsertMember(db, member);
  await saveInvite(db, { ...invite, useCount: invite.useCount + 1 });

  return c.json({ member, trip, alreadyMember: false }, 201);
});
