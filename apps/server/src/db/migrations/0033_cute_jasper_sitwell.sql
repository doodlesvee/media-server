CREATE TABLE "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"library_id" integer NOT NULL,
	"name" text NOT NULL,
	"name_source" text DEFAULT 'scanner' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "series_id" integer;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "season_number" integer;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "episode_number" integer;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "episode_title" text;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "series_library_name_unique" ON "series" USING btree ("library_id","name");--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;