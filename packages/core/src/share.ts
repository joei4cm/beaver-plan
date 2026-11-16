import type { ShareAspect, ShareTemplateId } from "./domain.js";

export type ShareTemplateMeta = {
  id: ShareTemplateId;
  nameZh: string;
  nameEn: string;
  aspect: ShareAspect;
  width: number;
  height: number;
  blurbZh: string;
  blurbEn: string;
};

export const SHARE_TEMPLATES: ShareTemplateMeta[] = [
  {
    id: "magazine-reel",
    nameZh: "杂志封面",
    nameEn: "Magazine cover",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    blurbZh: "竖版封面 · 适合朋友圈",
    blurbEn: "Portrait cover · Moments-ready",
  },
  {
    id: "path-square",
    nameZh: "足迹方卡",
    nameEn: "Path square",
    aspect: "1:1",
    width: 1080,
    height: 1080,
    blurbZh: "方图路径 · 适合小红书",
    blurbEn: "Square path · Xiaohongshu-ready",
  },
  {
    id: "day-film",
    nameZh: "一日胶片",
    nameEn: "Day film",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    blurbZh: "竖版胶片条 · 一日足迹",
    blurbEn: "Portrait film strip · one day",
  },
];

export function getShareTemplate(
  id: ShareTemplateId | string,
): ShareTemplateMeta | undefined {
  return SHARE_TEMPLATES.find((t) => t.id === id);
}

export type ShareSnapshot = {
  tripTitle: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  dayLabel?: string;
  dayDate?: string;
  places: string[];
  /** Absolute or same-origin media URLs / data URIs. */
  photos: string[];
  note?: string;
  pathPoints?: Array<{ lat: number; lng: number }>;
  locale: "zh-CN" | "en";
};

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateRange(snap: ShareSnapshot): string {
  if (snap.startDate && snap.endDate) {
    return `${snap.startDate} → ${snap.endDate}`;
  }
  return snap.dayDate ?? snap.startDate ?? "";
}

function brandLine(locale: ShareSnapshot["locale"]): string {
  return locale === "zh-CN" ? "海狸旅行 · Beaver Plan" : "Beaver Plan · 海狸旅行";
}

function pathHintSvg(
  points: Array<{ lat: number; lng: number }>,
  box: { x: number; y: number; w: number; h: number },
): string {
  if (points.length === 0) {
    return `<circle cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2}" r="6" fill="#f7faf8" opacity="0.5"/>`;
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pad = 18;
  const proj = (lat: number, lng: number) => {
    const nx = (lng - minLng) / (maxLng - minLng || 1);
    const ny = 1 - (lat - minLat) / (maxLat - minLat || 1);
    return {
      x: box.x + pad + nx * (box.w - pad * 2),
      y: box.y + pad + ny * (box.h - pad * 2),
    };
  };
  const coords = points.map((p) => proj(p.lat, p.lng));
  const d = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const dots = coords
    .map(
      (c, i) =>
        `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === 0 || i === coords.length - 1 ? 8 : 5}" fill="#f7faf8"/><circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === 0 || i === coords.length - 1 ? 4 : 2.5}" fill="#1f6b5c"/>`,
    )
    .join("");
  return `<path d="${d}" fill="none" stroke="#f7faf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>${dots}`;
}

function photoOrWash(
  href: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  washId: string,
): string {
  if (href) {
    return `<image href="${esc(href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${washId})"/>`;
}

function renderMagazineReel(snap: ShareSnapshot): string {
  const { width: W, height: H } = SHARE_TEMPLATES[0]!;
  const hero = snap.photos[0];
  const places = snap.places.slice(0, 5).map(esc).join("  ·  ");
  const title = esc(snap.tripTitle);
  const dest = esc(snap.destination ?? snap.dayLabel ?? "");
  const dates = esc(dateRange(snap));
  const note = esc((snap.note ?? "").slice(0, 80));
  const brand = esc(brandLine(snap.locale));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f4339"/>
      <stop offset="55%" stop-color="#1f6b5c"/>
      <stop offset="100%" stop-color="#b86b3c"/>
    </linearGradient>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#14201c" stop-opacity="0.15"/>
      <stop offset="45%" stop-color="#14201c" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#14201c" stop-opacity="0.82"/>
    </linearGradient>
  </defs>
  ${photoOrWash(hero, 0, 0, W, H, "wash")}
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#veil)"/>
  <text x="72" y="120" fill="#f7faf8" font-family="Georgia, 'Songti SC', serif" font-size="28" letter-spacing="6" opacity="0.85">${brand}</text>
  <text x="72" y="${H - 420}" fill="#f7faf8" font-family="Georgia, 'Songti SC', serif" font-size="92" font-weight="600">${title}</text>
  <text x="72" y="${H - 330}" fill="#d8e2dc" font-family="system-ui, 'PingFang SC', sans-serif" font-size="34">${dest}</text>
  <text x="72" y="${H - 270}" fill="#f7faf8" font-family="ui-monospace, monospace" font-size="26" opacity="0.9">${dates}</text>
  ${note ? `<text x="72" y="${H - 200}" fill="#f3efe6" font-family="system-ui, 'PingFang SC', sans-serif" font-size="28" opacity="0.92">${note}</text>` : ""}
  <text x="72" y="${H - 120}" fill="#f7faf8" font-family="system-ui, 'PingFang SC', sans-serif" font-size="24" opacity="0.78">${places || "—"}</text>
  <rect x="72" y="${H - 80}" width="120" height="4" fill="#b86b3c"/>
</svg>`;
}

function renderPathSquare(snap: ShareSnapshot): string {
  const meta = SHARE_TEMPLATES[1]!;
  const W = meta.width;
  const H = meta.height;
  const photos = snap.photos.slice(0, 4);
  const title = esc(snap.tripTitle);
  const dates = esc(dateRange(snap));
  const brand = esc(brandLine(snap.locale));
  const places = snap.places.slice(0, 4);
  const points = snap.pathPoints ?? [];

  const thumbs = [
    { x: 72, y: 620, w: 440, h: 320 },
    { x: 568, y: 620, w: 440, h: 320 },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f7faf8"/>
      <stop offset="100%" stop-color="#d8e2dc"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f4339"/>
      <stop offset="100%" stop-color="#1f6b5c"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  <rect x="48" y="48" width="${W - 96}" height="520" rx="18" fill="#0f4339"/>
  ${pathHintSvg(points, { x: 48, y: 48, w: W - 96, h: 520 })}
  <text x="72" y="100" fill="#f7faf8" font-family="system-ui, 'PingFang SC', sans-serif" font-size="22" letter-spacing="4" opacity="0.7">${brand}</text>
  <text x="72" y="170" fill="#f7faf8" font-family="Georgia, 'Songti SC', serif" font-size="64" font-weight="600">${title}</text>
  <text x="72" y="230" fill="#d8e2dc" font-family="ui-monospace, monospace" font-size="24">${dates}</text>
  ${thumbs
    .map((box, i) => {
      const clip = `clip${i}`;
      return `<defs><clipPath id="${clip}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="14"/></clipPath></defs>
      <g clip-path="url(#${clip})">${photoOrWash(photos[i], box.x, box.y, box.w, box.h, "wash")}</g>`;
    })
    .join("\n")}
  ${places
    .map(
      (p, i) =>
        `<text x="72" y="${980 + i * 28}" fill="#2a3a34" font-family="system-ui, 'PingFang SC', sans-serif" font-size="22">${esc(p)}</text>`,
    )
    .join("\n")}
</svg>`;
}

function renderDayFilm(snap: ShareSnapshot): string {
  const meta = SHARE_TEMPLATES[2]!;
  const W = meta.width;
  const H = meta.height;
  const title = esc(snap.tripTitle);
  const day = esc(snap.dayLabel ?? snap.destination ?? "");
  const dates = esc(snap.dayDate ?? dateRange(snap));
  const brand = esc(brandLine(snap.locale));
  const photos = snap.photos.slice(0, 3);
  const places = snap.places.slice(0, 3);
  const note = esc((snap.note ?? "").slice(0, 60));

  const frames = [
    { y: 280, photo: photos[0], place: places[0] },
    { y: 780, photo: photos[1], place: places[1] },
    { y: 1280, photo: photos[2], place: places[2] },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#14201c"/>
      <stop offset="100%" stop-color="#0f4339"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f6b5c"/>
      <stop offset="100%" stop-color="#b86b3c"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="72" y="110" fill="#f7faf8" font-family="system-ui, sans-serif" font-size="24" letter-spacing="5" opacity="0.7">${brand}</text>
  <text x="72" y="180" fill="#f7faf8" font-family="Georgia, 'Songti SC', serif" font-size="58">${title}</text>
  <text x="72" y="235" fill="#d8e2dc" font-family="system-ui, 'PingFang SC', sans-serif" font-size="28">${day}  ·  ${dates}</text>
  ${frames
    .map((f, i) => {
      const clip = `f${i}`;
      const place = esc(f.place ?? `Stop ${i + 1}`);
      return `
      <defs><clipPath id="${clip}"><rect x="72" y="${f.y}" width="936" height="420" rx="16"/></clipPath></defs>
      <g clip-path="url(#${clip})">${photoOrWash(f.photo, 72, f.y, 936, 420, "wash")}</g>
      <rect x="72" y="${f.y + 340}" width="936" height="80" fill="#14201c" opacity="0.55"/>
      <text x="96" y="${f.y + 390}" fill="#f7faf8" font-family="system-ui, 'PingFang SC', sans-serif" font-size="32">${i + 1}. ${place}</text>`;
    })
    .join("\n")}
  ${note ? `<text x="72" y="${H - 80}" fill="#f3efe6" font-family="system-ui, 'PingFang SC', sans-serif" font-size="26" opacity="0.85">${note}</text>` : ""}
</svg>`;
}

/** Compose a share card as SVG markup (preview + PNG pipeline input). */
export function renderShareSvg(
  templateId: ShareTemplateId,
  snap: ShareSnapshot,
): string {
  switch (templateId) {
    case "magazine-reel":
      return renderMagazineReel(snap);
    case "path-square":
      return renderPathSquare(snap);
    case "day-film":
      return renderDayFilm(snap);
    default: {
      const _exhaustive: never = templateId;
      return _exhaustive;
    }
  }
}

export function svgToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}
