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
  type ShareStyle,
  type ShareTemplateId,
} from "@beaver/core";
import { dbOf } from "./db/context.js";
import type { Bindings } from "./env.js";
import {
  mediaKeyFromRef,
  shareObjectKey,
} from "./media-store.js";
import {
  getObject,
  isS3Configured,
  putObject,
  requireS3Config,
  signedGetUrl,
} from "./s3.js";
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
  /** Session light-edit: cover title/subtitle, accent, title scale. */
  style?: ShareStyle;
};

function normalizeShareStyle(raw: ShareStyle | undefined): ShareStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const style: ShareStyle = {};
  if (typeof raw.coverTitle === "string") {
    style.coverTitle = raw.coverTitle.slice(0, 80);
  }
  if (typeof raw.coverSubtitle === "string") {
    style.coverSubtitle = raw.coverSubtitle.slice(0, 100);
  }
  if (
    typeof raw.accentColor === "string" &&
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.accentColor.trim())
  ) {
    style.accentColor = raw.accentColor.trim();
  }
  if (typeof raw.titleScale === "number" && Number.isFinite(raw.titleScale)) {
    style.titleScale = Math.min(1.4, Math.max(0.75, raw.titleScale));
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function bytesToDataUrl(contentType: string, bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

/** Prefer inlining media so SVG preview + PNG export are self-contained. */
async function resolvePhotoUrl(
  url: string,
  base: string | undefined,
  requestOrigin: string,
  env: Bindings,
): Promise<string> {
  if (url.startsWith("data:")) return url;

  const key = mediaKeyFromRef(url);
  if (key && isS3Configured(env)) {
    try {
      const cfg = requireS3Config(env);
      const obj = await getObject(cfg, key);
      if (obj) return bytesToDataUrl(obj.contentType, obj.body);
    } catch {
      // fall through to absolute URL
    }
  }

  if (url.startsWith("http://") || url.startsWith("https://")) return url;

  const root = (base ?? requestOrigin).replace(/\/$/, "");
  if (key) {
    // BFF proxy path so absolute URL still works if S3 fetch failed
    const id = key.replace(/^media\//, "");
    return `${root}/v1/media/${id}?proxy=1`;
  }
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
  const photos = await Promise.all(
    rawPhotos.map((u) =>
      resolvePhotoUrl(u, body.mediaBaseUrl, requestOrigin, c.env),
    ),
  );

  const dayIndex = day ? days.findIndex((d) => d.id === day.id) + 1 : undefined;
  const style = normalizeShareStyle(body.style);
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
    style,
  };

  const svg = renderShareSvg(template.id, snap);
  const dataUrl = svgToDataUrl(svg);

  let artifact: ShareArtifact | undefined;
  if (body.persist !== false) {
    const artifactId = crypto.randomUUID();
    let storageUrl = dataUrl;
    // Prefer persisting SVG object key in Neon when S3 is configured.
    if (isS3Configured(c.env)) {
      try {
        const cfg = requireS3Config(c.env);
        const key = shareObjectKey(artifactId);
        const bytes = new TextEncoder().encode(svg);
        await putObject(cfg, {
          key,
          body: bytes,
          contentType: "image/svg+xml",
        });
        storageUrl = key;
      } catch {
        storageUrl = dataUrl;
      }
    }
    artifact = {
      id: artifactId,
      tripId: trip.id,
      templateId: template.id,
      dayId: day?.id,
      width: template.width,
      height: template.height,
      storageUrl,
      createdAt: nowIso(),
    };
    await insertShare(db, artifact);
  }

  return c.json({
    template,
    snapshot: {
      ...snap,
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

  let resolveSigned: ((key: string) => Promise<string | undefined>) | null =
    null;
  if (isS3Configured(c.env)) {
    const cfg = requireS3Config(c.env);
    resolveSigned = async (key: string) => {
      try {
        return await signedGetUrl(cfg, { key, expiresInSec: 3600 });
      } catch {
        return undefined;
      }
    };
  }

  const mapped = await Promise.all(
    artifacts.map(async (a) => {
      const raw = a.storageUrl;
      if (!raw) {
        return { ...a, hasPreview: false };
      }
      if (raw.startsWith("data:")) {
        return {
          ...a,
          storageUrl: `${raw.slice(0, 48)}…`,
          hasPreview: true,
        };
      }
      if (
        (raw.startsWith("share/") || raw.startsWith("media/")) &&
        resolveSigned
      ) {
        const signed = await resolveSigned(raw);
        return {
          ...a,
          storageUrl: signed ?? raw,
          key: raw,
          hasPreview: Boolean(signed ?? raw),
        };
      }
      return { ...a, hasPreview: Boolean(raw) };
    }),
  );

  return c.json({ artifacts: mapped });
});
