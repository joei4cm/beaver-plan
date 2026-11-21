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
    nameZh: "光途封面",
    nameEn: "Lumen cover",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    blurbZh: "竖版旅报封面 · 朋友圈",
    blurbEn: "Portrait travel poster · Moments",
  },
  {
    id: "path-square",
    nameZh: "航线方卡",
    nameEn: "Route square",
    aspect: "1:1",
    width: 1080,
    height: 1080,
    blurbZh: "方图航线 · 小红书",
    blurbEn: "Square route map · Xiaohongshu",
  },
  {
    id: "day-film",
    nameZh: "一日光影",
    nameEn: "Day lumen",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    blurbZh: "竖版一日三帧 · 足迹叙事",
    blurbEn: "Three-frame day strip · stop story",
  },
  {
    id: "story-panel",
    nameZh: "叙事长幅",
    nameEn: "Story route",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    blurbZh: "竖版叙事条 · 封面句 + 停点",
    blurbEn: "Portrait story band · title + stops",
  },
  {
    id: "stamp-square",
    nameZh: "海报方卡",
    nameEn: "Poster square",
    aspect: "1:1",
    width: 1080,
    height: 1080,
    blurbZh: "方图旅报 · 小红书封面",
    blurbEn: "Square travel poster · cover ready",
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

/** Lumen Route defaults — azure river, luminous paper. */
const DEFAULT_ACCENT = "#2F6BFF";
const PAPER = "#F4F6FA";
const FOAM = "#FFFFFF";
const INK = "#0F172A";
const INK_SOFT = "#64748B";
const MIST = "#E6ECF5";
const RIVER = "#2F6BFF";
const RIVER_DEEP = "#1A4FD6";
const SKY = "#DBE8FF";

const FONT_DISPLAY =
  '"Bricolage Grotesque", "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
const FONT_BODY =
  '"Plus Jakarta Sans", "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

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

function brandMark(locale: ShareSnapshot["locale"]): string {
  return locale === "zh-CN" ? "海狸旅行" : "Beaver Plan";
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

/** SVG root with crisp text/path hints for hi-res PNG rasterization. */
function svgRoot(W: number, H: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">`;
}

function pathHintSvg(
  points: Array<{ lat: number; lng: number }>,
  box: { x: number; y: number; w: number; h: number },
  stroke = RIVER,
  fill = FOAM,
): string {
  if (points.length === 0) {
    return `<circle cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2}" r="7" fill="${stroke}" opacity="0.45"/>`;
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pad = 28;
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
    .map((c, i) => {
      const outer = i === 0 || i === coords.length - 1 ? 10 : 6;
      const inner = i === 0 || i === coords.length - 1 ? 4.5 : 2.5;
      return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${outer}" fill="${fill}"/><circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${inner}" fill="${stroke}"/>`;
    })
    .join("");
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>${dots}`;
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

/** 9:16 editorial lumen cover — sky plane + brand-first poster. */
function renderMagazineReel(snap: ShareSnapshot): string {
  const meta = getShareTemplate("magazine-reel")!;
  const { width: W, height: H } = meta;
  const hero = snap.photos[0];
  const places = snap.places.slice(0, 4).map(esc).join("  ·  ");
  const title = esc(resolveTitle(snap));
  const dest = esc(resolveSubtitle(snap));
  const dates = esc(dateRange(snap));
  const note = esc((snap.note ?? "").slice(0, 80));
  const brand = esc(brandLine(snap.locale));
  const mark = esc(brandMark(snap.locale));
  const accent = resolveAccent(snap);
  const titleSize = titlePx(88, snap);

  return `<?xml version="1.0" encoding="UTF-8"?>
${svgRoot(W, H)}
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${SKY}"/>
      <stop offset="42%" stop-color="${PAPER}"/>
      <stop offset="100%" stop-color="${FOAM}"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${SKY}"/>
      <stop offset="55%" stop-color="${RIVER}"/>
      <stop offset="100%" stop-color="${RIVER_DEEP}"/>
    </linearGradient>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${INK}" stop-opacity="0.08"/>
      <stop offset="38%" stop-color="${INK}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${INK}" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <defs><clipPath id="heroClip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>
  <g clip-path="url(#heroClip)">${photoOrWash(hero, 0, 0, W, H, "wash")}</g>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#veil)"/>
  <rect x="64" y="96" width="6" height="56" rx="3" fill="${accent}"/>
  <text class="bp-body" x="88" y="118" fill="${FOAM}" font-family="${FONT_BODY}" font-size="22" font-weight="600" letter-spacing="5">${brand}</text>
  <text class="bp-display" x="88" y="168" fill="${FOAM}" font-family="${FONT_DISPLAY}" font-size="34" font-weight="700" letter-spacing="-0.5">${mark}</text>
  <text class="bp-display" x="72" y="${H - 460}" fill="${FOAM}" font-family="${FONT_DISPLAY}" font-size="${titleSize}" font-weight="800" letter-spacing="-2">${title}</text>
  <text class="bp-body" x="72" y="${H - 360}" fill="${SKY}" font-family="${FONT_BODY}" font-size="32" font-weight="500">${dest}</text>
  <text class="bp-body" x="72" y="${H - 300}" fill="${FOAM}" font-family="${FONT_MONO}" font-size="24" opacity="0.88">${dates}</text>
  ${note ? `<text class="bp-body" x="72" y="${H - 230}" fill="${FOAM}" font-family="${FONT_BODY}" font-size="26" opacity="0.9">${note}</text>` : ""}
  <text class="bp-body" x="72" y="${H - 150}" fill="${FOAM}" font-family="${FONT_BODY}" font-size="22" opacity="0.78">${places || "—"}</text>
  <rect x="72" y="${H - 100}" width="140" height="5" rx="2.5" fill="${accent}"/>
  <text class="bp-body" x="72" y="${H - 56}" fill="${FOAM}" font-family="${FONT_BODY}" font-size="18" letter-spacing="3" opacity="0.7">LUMEN ROUTE</text>
</svg>`;
}

/** 1:1 luminous route card with path geometry. */
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
  const titleSize = titlePx(58, snap);

  const thumbs = [
    { x: 64, y: 640, w: 456, h: 280 },
    { x: 560, y: 640, w: 456, h: 280 },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
${svgRoot(W, H)}
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${PAPER}"/>
      <stop offset="100%" stop-color="${SKY}"/>
    </linearGradient>
    <linearGradient id="mapPanel" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="${FOAM}"/>
      <stop offset="100%" stop-color="${MIST}"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${SKY}"/>
      <stop offset="100%" stop-color="${RIVER}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  <rect x="48" y="48" width="${W - 96}" height="540" rx="20" fill="url(#mapPanel)"/>
  <rect x="48" y="48" width="8" height="540" rx="4" fill="${accent}"/>
  ${pathHintSvg(points, { x: 48, y: 48, w: W - 96, h: 540 }, accent, FOAM)}
  <text class="bp-body" x="80" y="96" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="18" font-weight="600" letter-spacing="4">${brand}</text>
  <text class="bp-display" x="80" y="168" fill="${INK}" font-family="${FONT_DISPLAY}" font-size="${titleSize}" font-weight="800" letter-spacing="-1.5">${title}</text>
  <text class="bp-body" x="80" y="220" fill="${accent}" font-family="${FONT_MONO}" font-size="22">${dates}</text>
  ${thumbs
    .map((box, i) => {
      const clip = `clip${i}`;
      return `<defs><clipPath id="${clip}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="16"/></clipPath></defs>
      <g clip-path="url(#${clip})">${photoOrWash(photos[i], box.x, box.y, box.w, box.h, "wash")}</g>`;
    })
    .join("\n")}
  ${places
    .map((p, i) => {
      const y = 970 + i * 26;
      return `<circle cx="72" cy="${y - 6}" r="5" fill="${accent}"/><text class="bp-body" x="90" y="${y}" fill="${INK}" font-family="${FONT_BODY}" font-size="20">${esc(p)}</text>`;
    })
    .join("\n")}
  <text class="bp-body" x="${W - 220}" y="${H - 48}" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="16" letter-spacing="2">BEAVER PLAN</text>
</svg>`;
}

/** 9:16 three-frame day strip on luminous paper. */
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
  const titleSize = titlePx(52, snap);

  const frames = [
    { y: 300, photo: photos[0], place: places[0] },
    { y: 820, photo: photos[1], place: places[1] },
    { y: 1340, photo: photos[2], place: places[2] },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
${svgRoot(W, H)}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${PAPER}"/>
      <stop offset="100%" stop-color="${SKY}"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${SKY}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text class="bp-body" x="72" y="100" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="20" font-weight="600" letter-spacing="4">${brand}</text>
  <text class="bp-display" x="72" y="172" fill="${INK}" font-family="${FONT_DISPLAY}" font-size="${titleSize}" font-weight="800" letter-spacing="-1.2">${title}</text>
  <text class="bp-body" x="72" y="230" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="26">${day}  ·  ${dates}</text>
  <rect x="72" y="258" width="72" height="5" rx="2.5" fill="${accent}"/>
  ${frames
    .map((f, i) => {
      const clip = `f${i}`;
      const place = esc(f.place ?? `Stop ${i + 1}`);
      return `
      <defs><clipPath id="${clip}"><rect x="72" y="${f.y}" width="936" height="440" rx="18"/></clipPath></defs>
      <g clip-path="url(#${clip})">${photoOrWash(f.photo, 72, f.y, 936, 440, "wash")}</g>
      <rect x="72" y="${f.y + 352}" width="936" height="88" fill="${INK}" opacity="0.55"/>
      <circle cx="118" cy="${f.y + 396}" r="22" fill="${accent}"/>
      <text class="bp-display" x="118" y="${f.y + 403}" text-anchor="middle" fill="${FOAM}" font-family="${FONT_DISPLAY}" font-size="22" font-weight="700">${i + 1}</text>
      <text class="bp-body" x="158" y="${f.y + 404}" fill="${FOAM}" font-family="${FONT_BODY}" font-size="30" font-weight="600">${place}</text>`;
    })
    .join("\n")}
  ${note ? `<text class="bp-body" x="72" y="${H - 56}" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="24">${note}</text>` : `<text class="bp-body" x="72" y="${H - 56}" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="18" letter-spacing="3">BEAVER PLAN · 海狸旅行</text>`}
</svg>`;
}

/** 9:16 story band — azure rail + hero + stop list. */
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
  const titleSize = titlePx(72, snap);
  const rail = 48;

  return `<?xml version="1.0" encoding="UTF-8"?>
${svgRoot(W, H)}
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${SKY}"/>
      <stop offset="55%" stop-color="${RIVER}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${FOAM}"/>
      <stop offset="100%" stop-color="${PAPER}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#panel)"/>
  <rect x="0" y="0" width="${rail}" height="${H}" fill="${accent}"/>
  <defs><clipPath id="heroClip"><rect x="${rail + 36}" y="110" width="${W - rail - 72}" height="780" rx="16"/></clipPath></defs>
  <g clip-path="url(#heroClip)">${photoOrWash(hero, rail + 36, 110, W - rail - 72, 780, "wash")}</g>
  <text class="bp-body" x="${rail + 44}" y="78" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="18" font-weight="600" letter-spacing="4">${brand}</text>
  <text class="bp-display" x="${rail + 44}" y="990" fill="${INK}" font-family="${FONT_DISPLAY}" font-size="${titleSize}" font-weight="800" letter-spacing="-1.6">${title}</text>
  <text class="bp-body" x="${rail + 44}" y="1055" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="30">${subtitle}</text>
  <text class="bp-body" x="${rail + 44}" y="1105" fill="${accent}" font-family="${FONT_MONO}" font-size="22">${dates}</text>
  ${places
    .map((p, i) => {
      const y = 1185 + i * 52;
      return `<circle cx="${rail + 52}" cy="${y - 8}" r="8" fill="${accent}"/><text class="bp-display" x="${rail + 52}" y="${y - 3}" text-anchor="middle" fill="${FOAM}" font-family="${FONT_DISPLAY}" font-size="11" font-weight="700">${i + 1}</text><text class="bp-body" x="${rail + 76}" y="${y}" fill="${INK}" font-family="${FONT_BODY}" font-size="24">${esc(p)}</text>`;
    })
    .join("\n")}
  ${note ? `<text class="bp-body" x="${rail + 44}" y="${H - 90}" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="22">${note}</text>` : ""}
  <text class="bp-body" x="${rail + 44}" y="${H - 42}" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="16" letter-spacing="2">BEAVER PLAN · 海狸旅行</text>
</svg>`;
}

/** 1:1 luminous poster square for Xiaohongshu covers. */
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
  const titleSize = titlePx(52, snap);
  const inset = 56;

  return `<?xml version="1.0" encoding="UTF-8"?>
${svgRoot(W, H)}
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${PAPER}"/>
      <stop offset="100%" stop-color="${SKY}"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${SKY}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  <rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="24" fill="${FOAM}" stroke="${MIST}" stroke-width="2"/>
  <rect x="${inset}" y="${inset}" width="10" height="${H - inset * 2}" rx="5" fill="${accent}"/>
  <defs><clipPath id="posterPhoto"><rect x="${inset + 28}" y="${inset + 28}" width="${W - (inset + 28) * 2}" height="520" rx="16"/></clipPath></defs>
  <g clip-path="url(#posterPhoto)">${photoOrWash(hero, inset + 28, inset + 28, W - (inset + 28) * 2, 520, "wash")}</g>
  <circle cx="${W - inset - 48}" cy="${inset + 48}" r="18" fill="${accent}"/>
  <circle cx="${W - inset - 48}" cy="${inset + 48}" r="7" fill="${FOAM}"/>
  <text class="bp-body" x="${inset + 36}" y="680" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="16" font-weight="600" letter-spacing="4">${brand}</text>
  <text class="bp-display" x="${inset + 36}" y="750" fill="${INK}" font-family="${FONT_DISPLAY}" font-size="${titleSize}" font-weight="800" letter-spacing="-1.2">${title}</text>
  <text class="bp-body" x="${inset + 36}" y="810" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="26">${subtitle}</text>
  <text class="bp-body" x="${inset + 36}" y="860" fill="${accent}" font-family="${FONT_MONO}" font-size="20">${dates}</text>
  <text class="bp-body" x="${inset + 36}" y="920" fill="${INK}" font-family="${FONT_BODY}" font-size="20" opacity="0.85">${places || "—"}</text>
  <rect x="${inset + 36}" y="${H - inset - 52}" width="120" height="5" rx="2.5" fill="${accent}"/>
  <text class="bp-body" x="${inset + 36}" y="${H - inset - 20}" fill="${INK_SOFT}" font-family="${FONT_BODY}" font-size="15" letter-spacing="2">LUMEN ROUTE</text>
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

/** Lumen Route accent presets for the light-edit UI. */
export const SHARE_ACCENT_PRESETS = [
  "#2F6BFF",
  "#1A4FD6",
  "#0F172A",
  "#60A5FA",
  "#64748B",
  "#E11D48",
] as const;
