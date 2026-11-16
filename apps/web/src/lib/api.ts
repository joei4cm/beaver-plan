const DEFAULT_BASE = "http://127.0.0.1:8787";

export function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || DEFAULT_BASE
  );
}

export type ApiAuth = {
  /** Clerk session JWT when signed in. */
  getToken?: () => Promise<string | null>;
  /** Demo identity when Clerk keys are absent. */
  demoUserId?: string;
  demoDisplayName?: string;
};

let authBridge: ApiAuth = {
  demoUserId: "demo-user",
  demoDisplayName: "Demo Traveler",
};

/** Called from client auth shell so fetch helpers attach the right identity. */
export function setApiAuth(next: ApiAuth) {
  authBridge = next;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (authBridge.getToken) {
    const token = await authBridge.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      return headers;
    }
  }
  if (authBridge.demoUserId) {
    headers["X-Beaver-User-Id"] = authBridge.demoUserId;
  }
  if (authBridge.demoDisplayName) {
    headers["X-Beaver-Display-Name"] = authBridge.demoDisplayName;
  }
  return headers;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(await authHeaders()),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}
