import type {
  Day,
  JournalEntry,
  Leg,
  ShareTemplateId,
  ShareTemplateMeta,
  Stop,
  Trip,
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
};

export async function fetchTrip(id: string): Promise<TripPayload> {
  const res = await fetch(`${apiBase()}/v1/trips/${id}`);
  if (!res.ok) throw new Error(`trip_${res.status}`);
  return (await res.json()) as TripPayload;
}

export async function fetchJournal(
  tripId: string,
): Promise<{ entries: JournalEntry[] }> {
  const res = await fetch(`${apiBase()}/v1/trips/${tripId}/journal`);
  if (!res.ok) throw new Error(`journal_${res.status}`);
  return (await res.json()) as { entries: JournalEntry[] };
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
  const res = await fetch(`${apiBase()}/v1/trips/${tripId}/journal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`journal_create_${res.status}`);
  return (await res.json()) as { entry: JournalEntry };
}

export async function uploadMediaBase64(input: {
  tripId: string;
  contentType: string;
  dataBase64: string;
}): Promise<{ url: string }> {
  const res = await fetch(`${apiBase()}/v1/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`media_${res.status}`);
  return (await res.json()) as { url: string };
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
  const res = await fetch(`${apiBase()}/v1/trips/${input.tripId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      templateId: input.templateId,
      dayId: input.dayId,
      mediaBaseUrl: apiBase(),
      persist: true,
    }),
  });
  if (!res.ok) throw new Error(`share_${res.status}`);
  return (await res.json()) as {
    template: ShareTemplateMeta;
    svg: string;
    previewUrl: string;
  };
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
