import type {
  Day,
  DayFillInterest,
  DayFillProposal,
  JournalEntry,
  Leg,
  MapEngineId,
  PlaceSummary,
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

export async function listTrips(): Promise<{ trips: Trip[] }> {
  return apiGet<{ trips: Trip[] }>("/v1/trips");
}

export type MobileTemplateCard = {
  id: string;
  title: { "zh-CN": string; en: string };
  destination: string;
  description: { "zh-CN": string; en: string };
  dayCount: number;
  stopCount: number;
};

export async function listTemplates(): Promise<{
  templates: MobileTemplateCard[];
}> {
  return apiGet<{ templates: MobileTemplateCard[] }>("/v1/templates");
}

export async function createTripFromTemplate(
  templateId: string,
): Promise<{ trip: Trip }> {
  return apiSend<{ trip: Trip }>(
    `/v1/templates/${encodeURIComponent(templateId)}/create`,
    "POST",
    {},
  );
}

/** Soft-fail classifier for demo shell when API/Neon is absent. */
export function isApiSoftFail(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /_503$|_502$|_504$|_404$|_500$|Failed to fetch|Network request failed|ECONNREFUSED|load_failed|TypeError/i.test(
    msg,
  );
}

export type DayFillStatus = {
  mode: "live" | "demo";
  provider: string;
  keys?: { openai?: boolean };
};

export async function fetchDayFillStatus(): Promise<DayFillStatus> {
  return apiGet<DayFillStatus>("/v1/day-fill/status");
}

export async function proposeDayFill(input: {
  tripId: string;
  interests: DayFillInterest[];
  maxWalkMinutesPerDay: number;
  dayCount: number;
  locale?: string;
}): Promise<{ proposal: DayFillProposal }> {
  return apiSend<{ proposal: DayFillProposal }>(
    `/v1/trips/${input.tripId}/day-fill/propose`,
    "POST",
    {
      interests: input.interests,
      maxWalkMinutesPerDay: input.maxWalkMinutesPerDay,
      dayCount: input.dayCount,
      locale: input.locale,
    },
  );
}

export async function applyDayFill(input: {
  tripId: string;
  proposal: DayFillProposal;
  expectedVersion: number;
}): Promise<void> {
  await apiSend(`/v1/trips/${input.tripId}/day-fill/apply`, "POST", {
    proposal: input.proposal,
    expectedVersion: input.expectedVersion,
  });
}

export type EngineResolve = {
  preference: string;
  region: string;
  engineId: string;
  mode: string;
  autoAmapCn?: boolean;
};

/** Resolve which map engine would be used (settings probe). */
export async function fetchMapEngine(input: {
  preference: Trip["mapEngine"];
  timezone?: string;
}): Promise<EngineResolve> {
  const params = new URLSearchParams({
    preference: input.preference,
  });
  if (input.timezone) params.set("timezone", input.timezone);
  return apiGet<EngineResolve>(`/v1/maps/engine?${params.toString()}`);
}

export type PlacesSearchResponse = {
  places: PlaceSummary[];
  engineId?: MapEngineId;
  mode?: "live" | "demo";
  region?: string;
};

export async function searchPlaces(input: {
  q: string;
  lat?: number;
  lng?: number;
  language?: string;
  engine?: string;
  timezone?: string;
}): Promise<PlacesSearchResponse> {
  const params = new URLSearchParams({
    q: input.q,
    engine: input.engine ?? "auto",
    language: input.language ?? "zh-CN",
  });
  if (input.lat != null) params.set("lat", String(input.lat));
  if (input.lng != null) params.set("lng", String(input.lng));
  if (input.timezone) params.set("timezone", input.timezone);
  return apiGet(`/v1/places/search?${params.toString()}`);
}

export async function addTripStop(input: {
  tripId: string;
  dayId: string;
  place: PlaceSummary;
  engine?: MapEngineId;
  expectedVersion?: number;
}): Promise<unknown> {
  return apiSend(`/v1/trips/${input.tripId}/stops`, "POST", {
    dayId: input.dayId,
    place: input.place,
    engine: input.engine,
    expectedVersion: input.expectedVersion,
  });
}

export async function routeTripDay(input: {
  tripId: string;
  dayId: string;
  mode?: "walk" | "transit" | "drive";
  engine?: string;
}): Promise<{ legs: Leg[]; mode: "live" | "demo"; engineId: MapEngineId }> {
  return apiSend(`/v1/trips/${input.tripId}/route-day`, "POST", {
    dayId: input.dayId,
    mode: input.mode ?? "transit",
    engine: input.engine ?? "auto",
  });
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
    expectedVersion?: number;
  },
): Promise<{ entry: JournalEntry; tripVersion?: number }> {
  return apiSend(`/v1/trips/${tripId}/journal`, "POST", body);
}

export async function uploadMediaBase64(input: {
  tripId: string;
  contentType: string;
  dataBase64: string;
}): Promise<{ url: string; key: string }> {
  return apiSend(`/v1/media`, "POST", input);
}

export async function renderShare(input: {
  tripId: string;
  templateId: ShareTemplateId;
  dayId?: string;
  style?: {
    coverTitle?: string;
    coverSubtitle?: string;
    accentColor?: string;
    titleScale?: number;
  };
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
    style: input.style,
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
  if (url.startsWith("media/")) {
    const id = url.slice("media/".length);
    return `${base}/v1/media/${encodeURIComponent(id)}`;
  }
  if (url.startsWith("/")) return `${base}${url}`;
  return `${base}/v1/media/${encodeURIComponent(url)}`;
}

export type TranslationStatus = {
  mode: "live" | "demo";
  asr: string;
  llm: string;
  tts: string;
  vision: string;
  featureEnabled: boolean;
  locales: string[];
  primaryLocales?: string[];
  streamingMode?: string;
  offlineAssist?: string;
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

export type PhrasebookItem = {
  id: string;
  category: string;
  key: string;
  sourceText: string;
  translatedText: string;
};

export async function fetchPhrasebook(input: {
  sourceLocale: string;
  targetLocale: string;
  category?: string;
}): Promise<PhrasebookItem[]> {
  const q = new URLSearchParams({
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
  });
  if (input.category) q.set("category", input.category);
  const res = await apiGet<{ phrases: PhrasebookItem[] }>(
    `/v1/translation/phrasebook?${q.toString()}`,
  );
  return res.phrases;
}

export async function runPartialAsr(input: {
  audioBase64?: string;
  mimeType?: string;
  locale: string;
  targetLocale: string;
  sessionId?: string;
  sequence?: number;
  demoTurnIndex?: number;
}): Promise<{ text: string; isFinal: boolean; provider: string }> {
  return apiSend("/v1/translation/partial", "POST", input);
}
