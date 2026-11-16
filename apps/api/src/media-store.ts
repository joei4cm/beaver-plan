import type { MediaObject } from "@beaver/core";

/**
 * In-memory media stub (Slice C).
 * Production path: bind R2 bucket as `MEDIA` and PUT objects with the same key shape.
 * See README — Media / R2.
 */
export const mediaById = new Map<string, MediaObject>();

/** Tiny PNG (1×1 river green) used only if SVG placeholders fail — not for UI. */
export const TINY_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

export function makePlaceholderSvg(opts: {
  title: string;
  subtitle?: string;
  tone?: "river" | "timber" | "mist";
}): Uint8Array {
  const tones = {
    river: ["#0f4339", "#1f6b5c"],
    timber: ["#8a4b28", "#b86b3c"],
    mist: ["#2a3a34", "#6b8578"],
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
  <circle cx="920" cy="280" r="180" fill="#f7faf8" opacity="0.08"/>
  <circle cx="200" cy="1280" r="260" fill="#f7faf8" opacity="0.06"/>
  <text x="80" y="1400" fill="#f7faf8" font-family="Georgia, serif" font-size="64">${escapeXml(opts.title)}</text>
  ${
    opts.subtitle
      ? `<text x="80" y="1480" fill="#d8e2dc" font-family="system-ui, sans-serif" font-size="32">${escapeXml(opts.subtitle)}</text>`
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

export function putMedia(input: {
  bytes: Uint8Array;
  contentType: string;
  tripId?: string;
  id?: string;
}): MediaObject {
  const id = input.id ?? crypto.randomUUID();
  const obj: MediaObject = {
    id,
    contentType: input.contentType,
    bytes: input.bytes,
    createdAt: new Date().toISOString(),
    tripId: input.tripId,
  };
  mediaById.set(id, obj);
  return obj;
}

export function mediaPublicPath(id: string): string {
  return `/v1/media/${id}`;
}
