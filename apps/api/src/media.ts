import { Hono } from "hono";
import type { Bindings } from "./env.js";
import {
  mediaIdFromRef,
  mediaKeyFromRef,
  mediaObjectKey,
  mediaPublicPath,
  putMediaObject,
} from "./media-store.js";
import {
  getObject,
  isS3Configured,
  mediaMissingResponse,
  requireS3Config,
  signedGetUrl,
  signedPutUrl,
  S3ConfigError,
} from "./s3.js";

export const mediaRoutes = new Hono<{ Bindings: Bindings }>();

async function requireCfg(c: {
  env: Bindings;
  json: (body: unknown, status?: number) => Response;
}) {
  if (!isS3Configured(c.env)) return null;
  try {
    return requireS3Config(c.env);
  } catch (e) {
    if (e instanceof S3ConfigError) return null;
    throw e;
  }
}

/**
 * Upload via BFF → S3 PutObject.
 * Accepts JSON `{ contentType, dataBase64, tripId? }` or multipart `file`.
 * Returns object `key` (store in Neon journal.media) + stable BFF `url`.
 */
mediaRoutes.post("/v1/media", async (c) => {
  const cfg = await requireCfg(c);
  if (!cfg) return mediaMissingResponse(c);

  const contentTypeHeader = c.req.header("content-type") ?? "";

  if (contentTypeHeader.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!file || typeof file === "string") {
      return c.json({ error: "file_required" }, 400);
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const tripId =
      typeof form.tripId === "string" ? form.tripId : undefined;
    const contentType = file.type || "application/octet-stream";
    const obj = await putMediaObject(cfg, {
      bytes: buf,
      contentType,
      tripId,
    });
    return c.json(
      {
        id: obj.id,
        key: obj.key,
        url: obj.url,
        contentType,
        storage: "s3",
        createdAt: new Date().toISOString(),
      },
      201,
    );
  }

  let body: { contentType?: string; dataBase64?: string; tripId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body.dataBase64) {
    return c.json({ error: "dataBase64_required" }, 400);
  }
  const contentType = body.contentType ?? "image/jpeg";
  let bytes: Uint8Array;
  try {
    const bin = atob(body.dataBase64.replace(/^data:[^;]+;base64,/, ""));
    bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return c.json({ error: "invalid_base64" }, 400);
  }
  const obj = await putMediaObject(cfg, {
    bytes,
    contentType,
    tripId: body.tripId,
  });
  return c.json(
    {
      id: obj.id,
      key: obj.key,
      url: obj.url,
      contentType,
      storage: "s3",
      createdAt: new Date().toISOString(),
    },
    201,
  );
});

/**
 * Presign a direct PUT to R2/S3. Client must send matching Content-Type.
 * Configure bucket CORS for browser uploads (see README).
 */
mediaRoutes.post("/v1/media/presign", async (c) => {
  const cfg = await requireCfg(c);
  if (!cfg) return mediaMissingResponse(c);

  let body: { contentType?: string; tripId?: string; id?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const id = body.id ?? crypto.randomUUID();
  const contentType = body.contentType ?? "image/jpeg";
  const key = mediaObjectKey(id);
  const uploadUrl = await signedPutUrl(cfg, {
    key,
    contentType,
    expiresInSec: 900,
  });
  const downloadUrl = await signedGetUrl(cfg, { key, expiresInSec: 3600 });

  return c.json({
    id,
    key,
    uploadUrl,
    method: "PUT" as const,
    headers: { "Content-Type": contentType },
    expiresInSec: 900,
    url: mediaPublicPath(id),
    downloadUrl,
    storage: "s3",
    note: "PUT file bytes to uploadUrl with the Content-Type header. Persist `key` in journal.media. Configure R2 CORS for browser PUTs.",
  });
});

/** JSON signed download URL for a media id or object key. */
mediaRoutes.get("/v1/media/:id/signed", async (c) => {
  const cfg = await requireCfg(c);
  if (!cfg) return mediaMissingResponse(c);
  const raw = c.req.param("id");
  const key = mediaKeyFromRef(raw) ?? mediaObjectKey(raw);
  const downloadUrl = await signedGetUrl(cfg, { key, expiresInSec: 3600 });
  return c.json({ key, downloadUrl, expiresInSec: 3600 });
});

/**
 * Fetch / redirect media. Default: 302 to signed GET (or public base URL).
 * `?proxy=1` streams bytes through the Worker (for share SVG inlining).
 */
mediaRoutes.get("/v1/media/:id", async (c) => {
  const cfg = await requireCfg(c);
  if (!cfg) return mediaMissingResponse(c);

  const raw = c.req.param("id");
  const id = mediaIdFromRef(raw) ?? raw;
  const key = mediaObjectKey(id);
  const proxy = c.req.query("proxy") === "1";

  if (!proxy) {
    const downloadUrl = await signedGetUrl(cfg, { key, expiresInSec: 3600 });
    return c.redirect(downloadUrl, 302);
  }

  const obj = await getObject(cfg, key);
  if (!obj) return c.json({ error: "not_found", key }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
