ALTER TABLE "scan_jobs" ADD COLUMN "items_new" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD COLUMN "items_updated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD COLUMN "items_moved" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD COLUMN "items_missing" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD COLUMN "items_skipped" integer DEFAULT 0 NOT NULL;