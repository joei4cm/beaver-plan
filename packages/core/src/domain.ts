/** Domain models for Beaver Plan / 海狸旅行 (Slice A stubs). */

export type MapEngineId = "google" | "amap";
/** Reserved for Phase 2 — do not wire adapters yet. */
export type FutureMapEngineId = "baidu";

export type TripRole = "owner" | "editor" | "viewer";

export type TripMember = {
  id: string;
  tripId: string;
  userId: string;
  role: TripRole;
  displayName?: string;
  joinedAt: string;
};

/** Invite join link / short code — owner|editor create; never grants owner. */
export type TripInvite = {
  id: string;
  tripId: string;
  code: string;
  role: Exclude<TripRole, "owner">;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  maxUses?: number;
  useCount: number;
};

export type CreateInviteInput = {
  role?: Exclude<TripRole, "owner">;
  /** Hours until expiry; omit for no expiry. */
  expiresInHours?: number;
  maxUses?: number;
};

export type AcceptInviteInput = {
  displayName?: string;
};

export type Trip = {
  id: string;
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  timezone: string;
  locale: "zh-CN" | "en";
  /** `auto` follows product rules (Google default; Amap in mainland CN). */
  mapEngine: MapEngineId | "auto";
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Day = {
  id: string;
  tripId: string;
  date: string;
  note?: string;
};

export type PlaceRef = {
  engine: MapEngineId;
  enginePlaceId: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  raw?: unknown;
};

export type Stop = {
  id: string;
  dayId: string;
  order: number;
  place: PlaceRef;
  userNote?: string;
  photos: string[];
};

/** Normalized travel mode on a transfer step (engines may still send variants). */
export type TransitStepKind =
  | "WALK"
  | "TRANSIT"
  | "TRANSFER"
  | "DRIVE"
  | "WAIT";

export type TransitStep = {
  instruction: string;
  /** Prefer WALK | TRANSIT | TRANSFER | DRIVE | WAIT; engines may send vendor strings. */
  mode: string;
  durationSec?: number;
  /** Transit line / route name when present (e.g. "JR 奈良線", "市巴士 100"). */
  lineName?: string;
  /** Operator / agency (e.g. "JR西日本", "京都市交通局"). */
  agency?: string;
  /** Vehicle type hint: BUS | SUBWAY | TRAIN | TRAM | FERRY | … */
  vehicleType?: string;
  fromStopName?: string;
  toStopName?: string;
  /** Simple `lat,lng;…` polyline for this step — enables mode-styled map segments. */
  polyline?: string;
};

export type Leg = {
  id: string;
  fromStopId: string;
  toStopId: string;
  mode: "walk" | "transit" | "drive";
  durationSec: number;
  distanceM: number;
  polyline?: string;
  transitSteps: TransitStep[];
};

export type JournalEntry = {
  id: string;
  tripId: string;
  dayId?: string;
  stopId?: string;
  /** Short note — magazine caption, not a form field dump. */
  body: string;
  /** Object keys (`media/{id}`) or legacy `/v1/media/:id` paths. */
  media: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateJournalInput = {
  dayId?: string;
  stopId?: string;
  body: string;
  media?: string[];
};

export type UpdateJournalInput = {
  body?: string;
  media?: string[];
  dayId?: string | null;
  stopId?: string | null;
};

/** MVP share templates — WeChat Moments / Xiaohongshu friendly. */
export type ShareTemplateId = "magazine-reel" | "path-square" | "day-film";

export type ShareAspect = "9:16" | "1:1";

export type ShareArtifact = {
  id: string;
  tripId: string;
  templateId: ShareTemplateId;
  dayId?: string;
  width: number;
  height: number;
  /** Object key (`share/{id}.svg`), signed URL, or legacy SVG data URL. */
  storageUrl?: string;
  createdAt: string;
};

export type MediaObject = {
  id: string;
  contentType: string;
  /** Object key in S3/R2 (`media/{id}`). */
  key: string;
  createdAt: string;
  /** Optional trip scoping for cleanup. */
  tripId?: string;
};

export type CreateTripInput = {
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  locale?: Trip["locale"];
};

/** Clone an existing trip — structure + stops by default; optional journal text. */
export type DuplicateTripInput = {
  /** Copy journal captions without photos/media. Default false. */
  copyJournal?: boolean;
  /** Override title; default is locale-aware "Copy of …" / "副本 · …". */
  title?: string;
};

/** Materialize a city template into a new owned trip. */
export type CreateFromTemplateInput = {
  title?: string;
  /** YYYY-MM-DD; default = today (UTC). */
  startDate?: string;
};

/** Re-export session shape for domain consumers (Slice E). */
export type { TranslationSession, LanguagePair } from "./translation/types.js";
