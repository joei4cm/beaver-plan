import { Hono } from "hono";
import {
  SHARE_TEMPLATES,
  collectJournalPhotos,
  getShareTemplate,
  journalForDay,
  renderShareSvg,
  sortStops,
  stopsForDay,
  svgToDataUrl,
  type ShareArtifact,
  type ShareSnapshot,
  type ShareTemplateId,
} from "@beaver/core";
import { dbOf } from "./db/context.js";
import type { Bindings } from "./env.js";
import { mediaById } from "./media-store.js";
import {
  getTrip,
  insertShare,
  listDays,
  listJournal,
  listShare,
  listStops,
  nowIso,
} from "./store.js";

export const shareRoutes = new Hono<{ Bindings: Bindings }>();

shareRoutes.get("/v1/share/templates", (c) => {
  return c.json({ templates: SHARE_TEMPLATES });
});

type RenderBody = {
  templateId: ShareTemplateId;
  dayId?: string;
  /** Absolute API origin (fallback if media cannot be inlined). */
  mediaBaseUrl?: string;
  photoUrls?: string[];
  note?: string;
  persist?: boolean;
};

function bytesToDataUrl(contentType: string, bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

/** Prefer inlining `/v1/media/:id` so SVG preview + PNG export are self-contained. */
function resolvePhotoUrl(
  url: string,
  base: string | undefined,
  requestOrigin: string,
): string {
  if (url.startsWith("data:")) return url;

  const mediaMatch = url.match(/\/v1\/media\/([^/?#]+)/);
  if (mediaMatch) {
    const obj = mediaById.get(mediaMatch[1]!);
    if (obj) return bytesToDataUrl(obj.contentType, obj.bytes);
  }

  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const root = (base ?? requestOrigin).replace(/\/$/, "");
  return url.startsWith("/") ? `${root}${url}` : `${root}/${url}`;
}

shareRoutes.post("/v1/trips/:id/share", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);

  let body: RenderBody;
  try {
    body = await c.req.json<RenderBody>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const template = getShareTemplate(body.templateId);
  if (!template) return c.json({ error: "unknown_template" }, 400);

  const days = await listDays(db, trip.id);
  const day =
    (body.dayId ? days.find((d) => d.id === body.dayId) : undefined) ??
    days[0];
  const allStops = sortStops(await listStops(db, trip.id));
  const dayStops = day ? stopsForDay(allStops, day.id) : allStops;
  const entries = await listJournal(db, trip.id);
  const dayEntries = day
    ? journalForDay(
        entries,
        day.id,
        dayStops.map((s) => s.id),
      )
    : entries;

  const requestOrigin = new URL(c.req.url).origin;
  const rawPhotos =
    body.photoUrls && body.photoUrls.length > 0
      ? body.photoUrls
      : collectJournalPhotos(dayEntries, 6);
  const photos = rawPhotos.map((u) =>
    resolvePhotoUrl(u, body.mediaBaseUrl, requestOrigin),
  );

  const dayIndex = day ? days.findIndex((d) => d.id === day.id) + 1 : undefined;
  const snap: ShareSnapshot = {
    tripTitle: trip.title,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    dayLabel:
      dayIndex !== undefined
        ? trip.locale === "en"
          ? `Day ${dayIndex}`
          : `第 ${dayIndex} 天`
        : undefined,
    dayDate: day?.date,
    places: dayStops.map((s) => s.place.name),
    photos,
    note:
      body.note ??
      dayEntries.find((e) => e.body.trim())?.body ??
      day?.note,
    pathPoints: dayStops.map((s) => ({
      lat: s.place.lat,
      lng: s.place.lng,
    })),
    locale: trip.locale,
  };

  const svg = renderShareSvg(template.id, snap);
  const dataUrl = svgToDataUrl(svg);

  let artifact: ShareArtifact | undefined;
  if (body.persist !== false) {
    artifact = {
      id: crypto.randomUUID(),
      tripId: trip.id,
      templateId: template.id,
      dayId: day?.id,
      width: template.width,
      height: template.height,
      storageUrl: dataUrl,
      createdAt: nowIso(),
    };
    await insertShare(db, artifact);
  }

  return c.json({
    template,
    snapshot: {
      ...snap,
      // avoid echoing huge data URLs twice
      photos: snap.photos,
    },
    svg,
    previewUrl: dataUrl,
    artifact,
    exportHint:
      "Web: draw SVG onto canvas → download PNG. Mobile: write temp file + Share.shareAsync.",
  });
});

shareRoutes.get("/v1/trips/:id/share", async (c) => {
  const db = dbOf(c);
  const trip = await getTrip(db, c.req.param("id"));
  if (!trip) return c.json({ error: "not_found" }, 404);
  const artifacts = await listShare(db, trip.id);
  return c.json({
    artifacts: artifacts.map((a) => ({
      ...a,
      storageUrl: a.storageUrl?.startsWith("data:")
        ? `${a.storageUrl.slice(0, 48)}…`
        : a.storageUrl,
      hasPreview: Boolean(a.storageUrl),
    })),
  });
});
