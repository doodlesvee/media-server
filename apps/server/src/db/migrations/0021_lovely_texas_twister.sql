ALTER TABLE "media_items" ADD COLUMN "thumbnail_position_x" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "thumbnail_position_y" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "thumbnail_scale" integer DEFAULT 100 NOT NULL;