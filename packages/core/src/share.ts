import type { ShareAspect, ShareStyle, ShareTemplateId } from "./domain.js";

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
  {
    id: "story-panel",
    nameZh: "故事竖幅",
    nameEn: "Story panel",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    blurbZh: "竖版叙事条 · 强调封面句与地点",
    blurbEn: "Portrait story band · title + stops",
  },
  {
    id: "stamp-square",
    nameZh: "邮戳方卡",
    nameEn: "Stamp square",
    aspect: "1:1",
    width: 1080,
    height: 1080,
    blurbZh: "方图邮戳框 · 小红书封面感",
    blurbEn: "Square stamp frame · Xiaohongshu cover",
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
  /** Light-edit overrides for this export session. */
  style?: ShareStyle;
};

const DEFAULT_ACCENT = "#b86b3c";
const DEFAULT_RIVER = "#1f6b5c";

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

function resolveTitle(snap: ShareSnapshot): string {
  const override = snap.style?.coverTitle?.trim();
  return override || snap.tripTitle;
}

function resolveSubtitle(snap: ShareSnapshot): string {
  const override = snap.style?.coverSubtitle?.trim();
  if (override) return override;
  return snap.destination ?? snap.dayLabel ?? "";
}

function resolveAccent(snap: ShareSnapshot): string {
  const raw = snap.style?.accentColor?.trim();
  if (raw && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return raw;
  return DEFAULT_ACCENT;
}

function titlePx(base: number, snap: ShareSnapshot): number {
  const scale = snap.style?.titleScale;
  const s =
    typeof scale === "number" && Number.isFinite(scale)
      ? Math.min(1.4, Math.max(0.75, scale))
      : 1;
  return Math.round(base * s);
}

function pathHintSvg(
  points: Array<{ lat: number; lng: number }>,
  box: { x: number; y: number; w: number; h: number },
  stroke = "#f7faf8",
  fill = DEFAULT_RIVER,
): string {
  if (points.length === 0) {
    return `<circle cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2}" r="6" fill="${stroke}" opacity="0.5"/>`;
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
        `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === 0 || i === coords.length - 1 ? 8 : 5}" fill="${stroke}"/><circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === 0 || i === coords.length - 1 ? 4 : 2.5}" fill="${fill}"/>`,
    )
    .join("");
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>${dots}`;
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
  const meta = getShareTemplate("magazine-reel")!;
  const { width: W, height: H } = meta;
  const hero = snap.photos[0];
  const places = snap.places.slice(0, 5).map(esc).join("  ·  ");
  const title = esc(resolveTitle(snap));
  const dest = esc(resolveSubtitle(snap));
  const dates = esc(dateRange(snap));
  const note = esc((snap.note ?? "").slice(0, 80));
  const brand = esc(brandLine(snap.locale));
  const accent = resolveAccent(snap);
  const titleSize = titlePx(92, snap);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f4339"/>
      <stop offset="55%" stop-color="#1f6b5c"/>
      <stop offset="100%" stop-color="${accent}"/>
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
  <text x="72" y="${H - 420}" fill="#f7faf8" font-family="Georgia, 'Songti SC', serif" font-size="${titleSize}" font-weight="600">${title}</text>
  <text x="72" y="${H - 330}" fill="#d8e2dc" font-family="system-ui, 'PingFang SC', sans-serif" font-size="34">${dest}</text>
  <text x="72" y="${H - 270}" fill="#f7faf8" font-family="ui-monospace, monospace" font-size="26" opacity="0.9">${dates}</text>
  ${note ? `<text x="72" y="${H - 200}" fill="#f3efe6" font-family="system-ui, 'PingFang SC', sans-serif" font-size="28" opacity="0.92">${note}</text>` : ""}
  <text x="72" y="${H - 120}" fill="#f7faf8" font-family="system-ui, 'PingFang SC', sans-serif" font-size="24" opacity="0.78">${places || "—"}</text>
  <rect x="72" y="${H - 80}" width="120" height="4" fill="${accent}"/>
</svg>`;
}

function renderPathSquare(snap: ShareSnapshot): string {
  const meta = getShareTemplate("path-square")!;
  const W = meta.width;
  const H = meta.height;
  const photos = snap.photos.slice(0, 4);
  const title = esc(resolveTitle(snap));
  const dates = esc(dateRange(snap));
  const brand = esc(brandLine(snap.locale));
  const places = snap.places.slice(0, 4);
  const points = snap.pathPoints ?? [];
  const accent = resolveAccent(snap);
  const titleSize = titlePx(64, snap);

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
  ${pathHintSvg(points, { x: 48, y: 48, w: W - 96, h: 520 }, "#f7faf8", accent)}
  <text x="72" y="100" fill="#f7faf8" font-family="system-ui, 'PingFang SC', sans-serif" font-size="22" letter-spacing="4" opacity="0.7">${brand}</text>
  <text x="72" y="170" fill="#f7faf8" font-family="Georgia, 'Songti SC', serif" font-size="${titleSize}" font-weight="600">${title}</text>
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
  <rect x="${W - 168}" y="${H - 56}" width="96" height="4" fill="${accent}"/>
</svg>`;
}

function renderDayFilm(snap: ShareSnapshot): string {
  const meta = getShareTemplate("day-film")!;
  const W = meta.width;
  const H = meta.height;
  const title = esc(resolveTitle(snap));
  const day = esc(resolveSubtitle(snap) || snap.dayLabel || "");
  const dates = esc(snap.dayDate ?? dateRange(snap));
  const brand = esc(brandLine(snap.locale));
  const photos = snap.photos.slice(0, 3);
  const places = snap.places.slice(0, 3);
  const note = esc((snap.note ?? "").slice(0, 60));
  const accent = resolveAccent(snap);
  const titleSize = titlePx(58, snap);

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
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="72" y="248" width="64" height="4" fill="${accent}"/>
  <text x="72" y="110" fill="#f7faf8" font-family="system-ui, sans-serif" font-size="24" letter-spacing="5" opacity="0.7">${brand}</text>
  <text x="72" y="180" fill="#f7faf8" font-family="Georgia, 'Songti SC', serif" font-size="${titleSize}">${title}</text>
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

/** 9:16 editorial story band — accent rail + hero + stop list. */
function renderStoryPanel(snap: ShareSnapshot): string {
  const meta = getShareTemplate("story-panel")!;
  const { width: W, height: H } = meta;
  const hero = snap.photos[0];
  const title = esc(resolveTitle(snap));
  const subtitle = esc(resolveSubtitle(snap));
  const dates = esc(dateRange(snap));
  const brand = esc(brandLine(snap.locale));
  const places = snap.places.slice(0, 6);
  const note = esc((snap.note ?? "").slice(0, 72));
  const accent = resolveAccent(snap);
  const titleSize = titlePx(78, snap);
  const rail = 56;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f4339"/>
      <stop offset="60%" stop-color="#1f6b5c"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f7faf8"/>
      <stop offset="100%" stop-color="#e8efe9"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#panel)"/>
  <rect x="0" y="0" width="${rail}" height="${H}" fill="${accent}"/>
  <defs><clipPath id="heroClip"><rect x="${rail + 40}" y="120" width="${W - rail - 80}" height="820" rx="8"/></clipPath></defs>
  <g clip-path="url(#heroClip)">${photoOrWash(hero, rail + 40, 120, W - rail - 80, 820, "wash")}</g>
  <text x="${rail + 48}" y="88" fill="#0f4339" font-family="system-ui, 'PingFang SC', sans-serif" font-size="22" letter-spacing="5" opacity="0.75">${brand}</text>
  <text x="${rail + 48}" y="1040" fill="#14201c" font-family="Georgia, 'Songti SC', serif" font-size="${titleSize}" font-weight="600">${title}</text>
  <text x="${rail + 48}" y="1110" fill="#2a3a34" font-family="system-ui, 'PingFang SC', sans-serif" font-size="32">${subtitle}</text>
  <text x="${rail + 48}" y="1165" fill="#1f6b5c" font-family="ui-monospace, monospace" font-size="24">${dates}</text>
  ${places
    .map((p, i) => {
      const y = 1260 + i * 52;
      return `<circle cx="${rail + 56}" cy="${y - 8}" r="7" fill="${accent}"/><text x="${rail + 80}" y="${y}" fill="#14201c" font-family="system-ui, 'PingFang SC', sans-serif" font-size="26">${esc(p)}</text>`;
    })
    .join("\n")}
  ${note ? `<text x="${rail + 48}" y="${H - 90}" fill="#2a3a34" font-family="system-ui, 'PingFang SC', sans-serif" font-size="24" opacity="0.85">${note}</text>` : ""}
  <text x="${rail + 48}" y="${H - 40}" fill="#0f4339" font-family="Georgia, 'Songti SC', serif" font-size="20" opacity="0.55">Beaver Plan</text>
</svg>`;
}

/** 1:1 stamp / postcard frame for Xiaohongshu covers. */
function renderStampSquare(snap: ShareSnapshot): string {
  const meta = getShareTemplate("stamp-square")!;
  const { width: W, height: H } = meta;
  const hero = snap.photos[0];
  const title = esc(resolveTitle(snap));
  const subtitle = esc(resolveSubtitle(snap));
  const dates = esc(dateRange(snap));
  const brand = esc(brandLine(snap.locale));
  const places = snap.places.slice(0, 3).map(esc).join(" · ");
  const accent = resolveAccent(snap);
  const titleSize = titlePx(56, snap);
  const inset = 64;
  const frame = 28;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f3efe6"/>
      <stop offset="100%" stop-color="#e4ebe5"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f4339"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  <rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="10 8" rx="6"/>
  <rect x="${inset + frame}" y="${inset + frame}" width="${W - (inset + frame) * 2}" height="560" fill="#14201c"/>
  <defs><clipPath id="stampPhoto"><rect x="${inset + frame + 12}" y="${inset + frame + 12}" width="${W - (inset + frame) * 2 - 24}" height="536" rx="4"/></clipPath></defs>
  <g clip-path="url(#stampPhoto)">${photoOrWash(hero, inset + frame + 12, inset + frame + 12, W - (inset + frame) * 2 - 24, 536, "wash")}</g>
  <circle cx="${W - inset - 36}" cy="${inset + 36}" r="22" fill="none" stroke="${accent}" stroke-width="2"/>
  <circle cx="${W - inset - 36}" cy="${inset + 36}" r="8" fill="${accent}" opacity="0.85"/>
  <text x="${inset + frame}" y="760" fill="#0f4339" font-family="system-ui, 'PingFang SC', sans-serif" font-size="18" letter-spacing="4" opacity="0.7">${brand}</text>
  <text x="${inset + frame}" y="830" fill="#14201c" font-family="Georgia, 'Songti SC', serif" font-size="${titleSize}" font-weight="600">${title}</text>
  <text x="${inset + frame}" y="890" fill="#2a3a34" font-family="system-ui, 'PingFang SC', sans-serif" font-size="28">${subtitle}</text>
  <text x="${inset + frame}" y="940" fill="#1f6b5c" font-family="ui-monospace, monospace" font-size="22">${dates}</text>
  <text x="${inset + frame}" y="1000" fill="#2a3a34" font-family="system-ui, 'PingFang SC', sans-serif" font-size="22" opacity="0.85">${places || "—"}</text>
  <rect x="${inset + frame}" y="${H - inset - 28}" width="140" height="5" fill="${accent}"/>
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
    case "story-panel":
      return renderStoryPanel(snap);
    case "stamp-square":
      return renderStampSquare(snap);
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

/** Sensible accent presets for the light-edit UI. */
export const SHARE_ACCENT_PRESETS = [
  "#b86b3c",
  "#1f6b5c",
  "#0f4339",
  "#2a9d8f",
  "#8b4513",
  "#c45c26",
] as const;
