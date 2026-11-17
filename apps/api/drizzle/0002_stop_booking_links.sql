ALTER TABLE "stops" ADD COLUMN "booking_links" jsonb DEFAULT '[]'::jsonb NOT NULL;
