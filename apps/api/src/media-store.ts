import type { S3Config } from "./s3.js";
import { putObject } from "./s3.js";

/**
 * Object-key helpers for journal / share media.
 * Bytes live in S3-compatible storage (Cloudflare R2). Neon stores the key strings.
 *
 * Key shape is flat (`media/{id}`, `share/{id}.svg`) so `/v1/media/:id` routes cleanly.
 */

/** Canonical object key for a media id. */
export function mediaObjectKey(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "");
  return `media/${safe}`;
}

export function shareObjectKey(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "");
  return `share/${safe}.svg`;
}

/** Stable BFF path clients can use in <img src> (redirects to signed GET). */
export function mediaPublicPath(id: string): string {
  return `/v1/media/${id}`;
}

/** Extract media id from a stored key, legacy path, or bare id. */
export function mediaIdFromRef(ref: string): string | null {
  if (!ref || ref.startsWith("data:") || ref.startsWith("blob:")) return null;
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    const m = ref.match(/\/v1\/media\/([^/?#]+)/);
    return m?.[1] ?? null;
  }
  const pathMatch = ref.match(/^(?:\/v1\/media\/|media\/)([^/?#]+)$/);
  if (pathMatch) return pathMatch[1] ?? null;
  if (/^[a-zA-Z0-9._-]+$/.test(ref)) return ref;
  return null;
}

/** Resolve a DB-stored media ref to an object key. */
export function mediaKeyFromRef(ref: string): string | null {
  if (!ref || ref.startsWith("data:")) return null;
  if (ref.startsWith("media/") || ref.startsWith("share/")) {
    return ref.replace(/^\//, "");
  }
  const id = mediaIdFromRef(ref);
  if (!id) return null;
  return mediaObjectKey(id);
}

export function makePlaceholderSvg(opts: {
  title: string;
  subtitle?: string;
  tone?: "river" | "timber" | "mist" | "sky";
}): Uint8Array {
  // Lumen Route azure canvas — not Cartograph lagoon / terracotta magazine.
  const tones = {
    river: ["#1A4FD6", "#2F6BFF"],
    sky: ["#60A5FA", "#DBE8FF"],
    mist: ["#64748B", "#94A3B8"],
    timber: ["#E11D48", "#FB7185"],
  } as const;
  const [a, b] = tones[opts.tone ?? "river"];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a}"/>
      <stop offset="100%" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1600" fill="url(#g)"/>
  <circle cx="920" cy="280" r="180" fill="#ffffff" opacity="0.12"/>
  <circle cx="200" cy="1280" r="260" fill="#ffffff" opacity="0.08"/>
  <text x="80" y="1400" fill="#F4F6FA" font-family="Bricolage Grotesque, Plus Jakarta Sans, sans-serif" font-size="64" font-weight="700">${escapeXml(opts.title)}</text>
  ${
    opts.subtitle
      ? `<text x="80" y="1480" fill="#E6ECF5" font-family="Plus Jakarta Sans, sans-serif" font-size="32">${escapeXml(opts.subtitle)}</text>`
      : ""
  }
</svg>`;
  return new TextEncoder().encode(svg);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Upload bytes to S3 and return the object key (stored in Neon). */
export async function putMediaObject(
  cfg: S3Config,
  input: {
    bytes: Uint8Array;
    contentType: string;
    /** Kept for API compatibility; not embedded in the key. */
    tripId?: string;
    id?: string;
  },
): Promise<{ id: string; key: string; url: string }> {
  const id = input.id ?? crypto.randomUUID();
  const key = mediaObjectKey(id);
  await putObject(cfg, {
    key,
    body: input.bytes,
    contentType: input.contentType,
  });
  return {
    id,
    key,
    url: mediaPublicPath(id),
  };
}
