ALTER TABLE "media_files" ADD COLUMN "root_id" integer;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "in_scope" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_root_id_library_roots_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."library_roots"("id") ON DELETE no action ON UPDATE no action;