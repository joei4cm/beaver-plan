CREATE TABLE "trip_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"stop_id" text,
	"author_user_id" text NOT NULL,
	"author_display_name" text,
	"body" text NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_display_name" text,
	"summary" text NOT NULL,
	"payload" jsonb,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_comments" ADD CONSTRAINT "trip_comments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trip_activity_events" ADD CONSTRAINT "trip_activity_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
