import { Hono } from "hono";
import type { Bindings } from "./env.js";
import {
  mediaById,
  mediaPublicPath,
  putMedia,
} from "./media-store.js";
import { nowIso } from "./store.js";

export const mediaRoutes = new Hono<{ Bindings: Bindings }>();

/**
 * Upload stub — accepts JSON `{ contentType, dataBase64, tripId? }`
 * or multipart `file`. Persists in-memory; swap to R2 when `MEDIA` binding exists.
 */
mediaRoutes.post("/v1/media", async (c) => {
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
    const obj = putMedia({
      bytes: buf,
      contentType: file.type || "application/octet-stream",
      tripId,
    });
    return c.json(
      {
        id: obj.id,
        url: mediaPublicPath(obj.id),
        contentType: obj.contentType,
        storage: "memory",
        note: "R2-ready: bind MEDIA bucket and replace putMedia",
        createdAt: obj.createdAt,
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
  const obj = putMedia({
    bytes,
    contentType,
    tripId: body.tripId,
  });
  return c.json(
    {
      id: obj.id,
      url: mediaPublicPath(obj.id),
      contentType: obj.contentType,
      storage: "memory",
      note: "R2-ready: bind MEDIA bucket and replace putMedia",
      createdAt: obj.createdAt ?? nowIso(),
    },
    201,
  );
});

/** Presign stub — returns a same-origin POST target until R2 is wired. */
mediaRoutes.post("/v1/media/presign", async (c) => {
  let body: { contentType?: string; tripId?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const id = crypto.randomUUID();
  return c.json({
    uploadUrl: "/v1/media",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    bodyTemplate: {
      contentType: body.contentType ?? "image/jpeg",
      dataBase64: "<base64>",
      tripId: body.tripId,
    },
    publicUrl: mediaPublicPath(id),
    storage: "memory",
    note: "Stub presign — client POSTs base64/multipart to /v1/media. With R2, return a signed PUT URL.",
  });
});

mediaRoutes.get("/v1/media/:id", (c) => {
  const obj = mediaById.get(c.req.param("id"));
  if (!obj) return c.json({ error: "not_found" }, 404);
  return new Response(obj.bytes, {
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
