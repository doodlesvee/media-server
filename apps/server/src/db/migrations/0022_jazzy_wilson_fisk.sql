ALTER TABLE "performers" ADD COLUMN "image_position_x" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "image_position_y" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "image_scale" integer DEFAULT 100 NOT NULL;