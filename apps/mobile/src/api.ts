import type {
  Day,
  JournalEntry,
  Leg,
  ShareTemplateId,
  ShareTemplateMeta,
  Stop,
  Trip,
  TripMember,
  TripRole,
} from "@beaver/core";

const DEFAULT_BASE = "http://127.0.0.1:8787";

export function apiBase(): string {
  return (
    process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || DEFAULT_BASE
  );
}

export type TripPayload = {
  trip: Trip;
  days: Day[];
  stops: Stop[];
  legs: Leg[];
  members?: TripMember[];
  yourRole?: TripRole | null;
};

type ApiAuth = {
  getToken?: () => Promise<string | null>;
  demoUserId?: string;
  demoDisplayName?: string;
};

let authBridge: ApiAuth = {
  demoUserId: "demo-user",
  demoDisplayName: "Demo Traveler",
};

export function setMobileApiAuth(next: ApiAuth) {
  authBridge = next;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
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

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`${path}_${res.status}`);
  return (await res.json()) as T;
}

async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}_${res.status}`);
  return (await res.json()) as T;
}

export async function fetchTrip(id: string): Promise<TripPayload> {
  return apiGet<TripPayload>(`/v1/trips/${id}`);
}

export async function fetchMembers(
  tripId: string,
): Promise<{ members: TripMember[]; yourRole: TripRole | null }> {
  return apiGet(`/v1/trips/${tripId}/members`);
}

export async function createInvite(
  tripId: string,
  role: "editor" | "viewer" = "editor",
): Promise<{ code: string; inviteUrl: string }> {
  return apiSend(`/v1/trips/${tripId}/invites`, "POST", { role });
}

export async function previewInvite(code: string): Promise<{
  code: string;
  role: TripRole;
  trip: { id: string; title: string; destination?: string };
}> {
  return apiGet(`/v1/invites/${encodeURIComponent(code)}`);
}

export async function acceptInvite(
  code: string,
): Promise<{ trip: Trip; alreadyMember?: boolean }> {
  return apiSend(`/v1/invites/${encodeURIComponent(code)}/accept`, "POST", {});
}

export async function fetchJournal(
  tripId: string,
): Promise<{ entries: JournalEntry[] }> {
  return apiGet(`/v1/trips/${tripId}/journal`);
}

export async function createJournalEntry(
  tripId: string,
  body: {
    dayId?: string;
    stopId?: string;
    body: string;
    media?: string[];
  },
): Promise<{ entry: JournalEntry }> {
  return apiSend(`/v1/trips/${tripId}/journal`, "POST", body);
}

export async function uploadMediaBase64(input: {
  tripId: string;
  contentType: string;
  dataBase64: string;
}): Promise<{ url: string }> {
  return apiSend(`/v1/media`, "POST", input);
}

export async function renderShare(input: {
  tripId: string;
  templateId: ShareTemplateId;
  dayId?: string;
}): Promise<{
  template: ShareTemplateMeta;
  svg: string;
  previewUrl: string;
}> {
  return apiSend(`/v1/trips/${input.tripId}/share`, "POST", {
    templateId: input.templateId,
    dayId: input.dayId,
    mediaBaseUrl: apiBase(),
    persist: true,
  });
}

export function resolveMediaUrl(url: string): string {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  const base = apiBase();
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export type TranslationStatus = {
  mode: "live" | "demo";
  asr: string;
  llm: string;
  tts: string;
  vision: string;
  featureEnabled: boolean;
  locales: string[];
};

export type LiveTurnResponse = {
  sourceText: string;
  translatedText: string;
  pair: { sourceLocale: string; targetLocale: string };
  asrProvider: string;
  translateProvider: string;
  mode: "live" | "demo";
  tts: {
    audioBase64: string | null;
    mimeType: string;
    provider: string;
    speakLocally: boolean;
  } | null;
};

export type VisionResponse = {
  sourceText: string;
  translatedText: string | null;
  provider: string;
  mode: "live" | "demo";
  visionMode: "ocr" | "caption";
  pair: { sourceLocale: string; targetLocale: string };
};

export async function fetchTranslationStatus(): Promise<TranslationStatus> {
  return apiGet("/v1/translation/status");
}

export async function runTranslationTurn(input: {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  sourceLocale: string;
  targetLocale: string;
  withTts?: boolean;
  demoTurnIndex?: number;
}): Promise<LiveTurnResponse> {
  return apiSend("/v1/translation/turn", "POST", input);
}

export async function runVisionAssist(input: {
  imageBase64?: string;
  mimeType?: string;
  mode: "ocr" | "caption";
  sourceLocale: string;
  targetLocale: string;
}): Promise<VisionResponse> {
  return apiSend("/v1/translation/vision", "POST", input);
}
