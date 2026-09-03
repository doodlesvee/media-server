CREATE TABLE "media_item_performers" (
	"media_item_id" integer NOT NULL,
	"performer_id" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_item_performers_media_item_id_performer_id_pk" PRIMARY KEY("media_item_id","performer_id")
);
--> statement-breakpoint
CREATE TABLE "performers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "performers_source" text DEFAULT 'scanner' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_item_performers" ADD CONSTRAINT "media_item_performers_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_performers" ADD CONSTRAINT "media_item_performers_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "performers_name_lower_idx" ON "performers" USING btree (lower("name"));