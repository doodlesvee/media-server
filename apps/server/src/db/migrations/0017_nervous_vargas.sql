ALTER TABLE "playback_states" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "playback_states" ADD COLUMN "play_count" integer DEFAULT 0 NOT NULL;