/** Hi-res scale for social PNG (WeChat / Xiaohongshu). 2× keeps 1080 masters crisp. */
export const SHARE_EXPORT_SCALE = 2;

/** Rasterize an SVG string to a PNG blob via canvas (web download / share). */
export async function svgToPngBlob(
  svg: string,
  width: number,
  height: number,
  opts?: { scale?: number },
): Promise<Blob> {
  const scale = clampScale(opts?.scale ?? SHARE_EXPORT_SCALE);
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);
  const prepared = ensureSvgIntrinsicSize(svg, width, height);

  const url = URL.createObjectURL(
    new Blob([prepared], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    // Wait for Lumen display/body faces so SVG text rasterizes sharp (not fallback).
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready.catch(() => undefined);
    }
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Lumen paper — never leave transparent edges on export.
    ctx.fillStyle = "#F4F6FA";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("png_encode_failed"))),
        "image/png",
      );
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return SHARE_EXPORT_SCALE;
  return Math.min(3, Math.max(1, Math.round(n)));
}

/** Keep width/height + crisp rendering hints on the SVG root for canvas decode. */
function ensureSvgIntrinsicSize(
  svg: string,
  width: number,
  height: number,
): string {
  const trimmed = svg.trim();
  const open = trimmed.match(/<svg\b[^>]*>/i);
  if (!open) return trimmed;
  let tag = open[0];
  if (!/\bwidth=/i.test(tag)) {
    tag = tag.replace(/<svg\b/i, `<svg width="${width}"`);
  }
  if (!/\bheight=/i.test(tag)) {
    tag = tag.replace(/<svg\b/i, `<svg height="${height}"`);
  }
  if (!/\bshape-rendering=/i.test(tag)) {
    tag = tag.replace(/<svg\b/i, `<svg shape-rendering="geometricPrecision"`);
  }
  if (!/\btext-rendering=/i.test(tag)) {
    tag = tag.replace(/<svg\b/i, `<svg text-rendering="geometricPrecision"`);
  }
  return trimmed.replace(open[0], tag);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "sync";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("svg_image_load_failed"));
    img.src = src;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}
