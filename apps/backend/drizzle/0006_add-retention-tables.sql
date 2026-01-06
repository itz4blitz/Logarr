-- Add retention management tables

-- App settings table for storing runtime-configurable settings
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Retention history for tracking cleanup runs
CREATE TABLE IF NOT EXISTS "retention_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"info_deleted" integer DEFAULT 0 NOT NULL,
	"debug_deleted" integer DEFAULT 0 NOT NULL,
	"warn_deleted" integer DEFAULT 0 NOT NULL,
	"error_deleted" integer DEFAULT 0 NOT NULL,
	"orphaned_occurrences_deleted" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error_message" text
);

-- Indexes for retention history
CREATE INDEX IF NOT EXISTS "retention_history_started_at_idx" ON "retention_history" USING btree ("started_at");
CREATE INDEX IF NOT EXISTS "retention_history_status_idx" ON "retention_history" USING btree ("status");
