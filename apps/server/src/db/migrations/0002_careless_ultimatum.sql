CREATE TABLE "playback_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_item_id" integer NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "playback_states_media_item_id_unique" UNIQUE("media_item_id")
);
--> statement-breakpoint
ALTER TABLE "playback_states" ADD CONSTRAINT "playback_states_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;