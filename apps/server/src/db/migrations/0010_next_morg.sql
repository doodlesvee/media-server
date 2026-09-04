CREATE TABLE "studios" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "studio_id" integer;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "studio_source" text DEFAULT 'scanner' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "studios_name_lower_idx" ON "studios" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;