import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Bindings } from "./env.js";

export type AuthUser = {
  userId: string;
  displayName?: string;
  /** true when CLERK_SECRET_KEY is unset and we accept demo headers. */
  demo: boolean;
};

export type AuthVariables = {
  auth: AuthUser | null;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function clerkIssuer(env: Bindings): string | null {
  if (env.CLERK_JWT_ISSUER?.trim()) {
    return env.CLERK_JWT_ISSUER.trim().replace(/\/$/, "");
  }
  // Publishable keys encode frontend API host as base64 after pk_test_ / pk_live_
  const pk =
    env.CLERK_PUBLISHABLE_KEY?.trim() ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!pk) return null;
  const encoded = pk.replace(/^pk_(test|live)_/, "");
  if (!encoded || encoded.includes("xxxx")) return null;
  try {
    const decoded = atob(encoded);
    const host = decoded.replace(/\$/, "").trim();
    if (!host.includes(".")) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

function jwksFor(issuer: string) {
  let set = jwksCache.get(issuer);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    jwksCache.set(issuer, set);
  }
  return set;
}

export function clerkConfigured(env: Bindings): boolean {
  const secret = env.CLERK_SECRET_KEY?.trim();
  return Boolean(secret && !secret.includes("xxxxxxxx"));
}

export async function resolveAuthUser(
  env: Bindings,
  headers: {
    authorization?: string;
    demoUserId?: string;
    demoDisplayName?: string;
  },
): Promise<AuthUser | null> {
  const bearer = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (clerkConfigured(env) && bearer) {
    const issuer = clerkIssuer(env);
    if (!issuer) {
      throw new Error("clerk_issuer_missing");
    }
    try {
      const { payload } = await jwtVerify(bearer, jwksFor(issuer), {
        issuer,
      });
      const userId = String(payload.sub ?? "");
      if (!userId) return null;
      const displayName =
        typeof payload.name === "string"
          ? payload.name
          : typeof payload.email === "string"
            ? payload.email
            : undefined;
      return { userId, displayName, demo: false };
    } catch {
      return null;
    }
  }

  // Demo / local: no Clerk secret → accept explicit demo identity headers.
  if (!clerkConfigured(env)) {
    const userId = (headers.demoUserId ?? "demo-user").trim() || "demo-user";
    return {
      userId,
      displayName: headers.demoDisplayName?.trim() || "Demo Traveler",
      demo: true,
    };
  }

  return null;
}

/** Attach `auth` (may be null). Does not 401 by itself. */
export const attachAuth = createMiddleware<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  try {
    const auth = await resolveAuthUser(c.env, {
      authorization: c.req.header("authorization") ?? undefined,
      demoUserId: c.req.header("x-beaver-user-id") ?? undefined,
      demoDisplayName: c.req.header("x-beaver-display-name") ?? undefined,
    });
    c.set("auth", auth);
  } catch (err) {
    const message = err instanceof Error ? err.message : "auth_error";
    return c.json({ error: message }, 500);
  }
  await next();
});

/** Require a resolved user. When Clerk is on, Bearer JWT is mandatory. */
export const requireAuth = createMiddleware<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  const auth = c.get("auth");
  if (!auth) {
    return c.json(
      {
        error: "unauthorized",
        hint: clerkConfigured(c.env)
          ? "Pass Authorization: Bearer <Clerk session JWT>"
          : "Pass X-Beaver-User-Id in demo mode",
      },
      401,
    );
  }
  await next();
});
