import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Trip header — optimistic concurrency via `version`. */
export const trips = pgTable("trips", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  destination: text("destination"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  timezone: text("timezone").notNull(),
  locale: text("locale").notNull(),
  mapEngine: text("map_engine").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const days = pgTable("days", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  note: text("note"),
});

export const stops = pgTable("stops", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  dayId: text("day_id")
    .notNull()
    .references(() => days.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  placeEngine: text("place_engine").notNull(),
  placeEnginePlaceId: text("place_engine_place_id").notNull(),
  placeName: text("place_name").notNull(),
  placeAddress: text("place_address"),
  placeLat: real("place_lat").notNull(),
  placeLng: real("place_lng").notNull(),
  placeRaw: jsonb("place_raw"),
  userNote: text("user_note"),
  photos: jsonb("photos").$type<string[]>().notNull().default([]),
  /** Hotel / flight / ticket deep links — see BookingLink in @beaver/core. */
  bookingLinks: jsonb("booking_links")
    .$type<
      {
        kind: "hotel" | "flight" | "ticket";
        url: string;
        providerLabel?: string;
      }[]
    >()
    .notNull()
    .default([]),
});

export const legs = pgTable("legs", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  fromStopId: text("from_stop_id").notNull(),
  toStopId: text("to_stop_id").notNull(),
  mode: text("mode").notNull(),
  durationSec: integer("duration_sec").notNull(),
  distanceM: integer("distance_m").notNull(),
  polyline: text("polyline"),
  transitSteps: jsonb("transit_steps")
    .$type<
      {
        instruction: string;
        mode: string;
        durationSec?: number;
        lineName?: string;
        agency?: string;
        vehicleType?: string;
        fromStopName?: string;
        toStopName?: string;
        polyline?: string;
      }[]
    >()
    .notNull()
    .default([]),
});

export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  dayId: text("day_id"),
  stopId: text("stop_id"),
  body: text("body").notNull(),
  media: jsonb("media").$type<string[]>().notNull().default([]),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const shareArtifacts = pgTable("share_artifacts", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  dayId: text("day_id"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  storageUrl: text("storage_url"),
  createdAt: text("created_at").notNull(),
});

export const tripMembers = pgTable(
  "trip_members",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    displayName: text("display_name"),
    joinedAt: text("joined_at").notNull(),
  },
  (t) => [uniqueIndex("trip_members_trip_user_uidx").on(t.tripId, t.userId)],
);

export const tripInvites = pgTable(
  "trip_invites",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    role: text("role").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
  },
  (t) => [uniqueIndex("trip_invites_code_uidx").on(t.code)],
);

export const tripComments = pgTable("trip_comments", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  stopId: text("stop_id"),
  authorUserId: text("author_user_id").notNull(),
  authorDisplayName: text("author_display_name"),
  body: text("body").notNull(),
  mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
  createdAt: text("created_at").notNull(),
});

export const tripActivityEvents = pgTable("trip_activity_events", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorDisplayName: text("actor_display_name"),
  summary: text("summary").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  createdAt: text("created_at").notNull(),
});

export const schema = {
  trips,
  days,
  stops,
  legs,
  journalEntries,
  shareArtifacts,
  tripMembers,
  tripInvites,
  tripComments,
  tripActivityEvents,
};
