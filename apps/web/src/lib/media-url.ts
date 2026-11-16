import { apiBase, apiSend } from "./api";

/**
 * Turn a stored media ref (object key `media/{id}`, legacy `/v1/media/:id`,
 * or absolute/data URL) into something `<img src>` can load.
 */
export function resolveMediaUrl(url: string): string {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }
  const base = apiBase();
  if (url.startsWith("media/")) {
    const id = url.slice("media/".length);
    return `${base}/v1/media/${encodeURIComponent(id)}`;
  }
  if (url.startsWith("/")) {
    return `${base}${url}`;
  }
  // bare id
  return `${base}/v1/media/${encodeURIComponent(url)}`;
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

type PresignResponse = {
  id: string;
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers: { "Content-Type": string };
  url: string;
};

/**
 * Prefer signed PUT to R2/S3; fall back to BFF base64 upload if CORS/network fails.
 * Returns the object `key` to store in journal.media.
 */
export async function uploadJournalPhoto(
  file: File,
  tripId: string,
): Promise<string> {
  const contentType = file.type || "image/jpeg";
  try {
    const presign = await apiSend<PresignResponse>("/v1/media/presign", "POST", {
      contentType,
      tripId,
    });
    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: presign.headers,
      body: file,
    });
    if (!put.ok) {
      throw new Error(`presign_put_${put.status}`);
    }
    return presign.key;
  } catch {
    const dataBase64 = await fileToBase64(file);
    const res = await apiSend<{ key: string; url: string }>("/v1/media", "POST", {
      contentType,
      dataBase64,
      tripId,
    });
    return res.key ?? res.url;
  }
}
