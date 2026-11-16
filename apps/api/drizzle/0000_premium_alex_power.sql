CREATE TABLE "days" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"date" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_id" text,
	"stop_id" text,
	"body" text NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legs" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"from_stop_id" text NOT NULL,
	"to_stop_id" text NOT NULL,
	"mode" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"distance_m" integer NOT NULL,
	"polyline" text,
	"transit_steps" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"template_id" text NOT NULL,
	"day_id" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"storage_url" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_id" text NOT NULL,
	"order" integer NOT NULL,
	"place_engine" text NOT NULL,
	"place_engine_place_id" text NOT NULL,
	"place_name" text NOT NULL,
	"place_address" text,
	"place_lat" real NOT NULL,
	"place_lng" real NOT NULL,
	"place_raw" jsonb,
	"user_note" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"code" text NOT NULL,
	"role" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text,
	"revoked_at" text,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_members" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"display_name" text,
	"joined_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"destination" text,
	"start_date" text,
	"end_date" text,
	"timezone" text NOT NULL,
	"locale" text NOT NULL,
	"map_engine" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legs" ADD CONSTRAINT "legs_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_artifacts" ADD CONSTRAINT "share_artifacts_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_invites_code_uidx" ON "trip_invites" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_members_trip_user_uidx" ON "trip_members" USING btree ("trip_id","user_id");