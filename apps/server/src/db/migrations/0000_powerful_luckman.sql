CREATE TABLE "libraries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_roots" (
	"id" serial PRIMARY KEY NOT NULL,
	"library_id" integer NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "library_roots_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_item_id" integer NOT NULL,
	"path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mtime" timestamp NOT NULL,
	"content_hash" text,
	"mime_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_files_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "media_item_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "media_item_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"library_id" integer NOT NULL,
	"parent_id" integer,
	"item_type_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_seconds" integer,
	"taken_at" timestamp,
	"extra_metadata" jsonb,
	"missing_since" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"files_scanned" integer DEFAULT 0 NOT NULL,
	"files_total" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "library_roots" ADD CONSTRAINT "library_roots_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_parent_id_media_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_item_type_id_media_item_types_id_fk" FOREIGN KEY ("item_type_id") REFERENCES "public"."media_item_types"("id") ON DELETE no action ON UPDATE no action;