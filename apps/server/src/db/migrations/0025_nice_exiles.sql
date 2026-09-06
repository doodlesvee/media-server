CREATE TABLE "albums" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"title" text NOT NULL,
	"performer_id" integer,
	"studio_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "albums_path_unique" UNIQUE("path")
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "album_id" integer;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;