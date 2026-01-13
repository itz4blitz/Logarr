CREATE TYPE "public"."api_key_type" AS ENUM('mobile', 'web', 'cli', 'integration');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('idle', 'pending', 'discovering', 'syncing', 'error');--> statement-breakpoint
CREATE TABLE "api_key_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_time" integer NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"type" "api_key_type" DEFAULT 'mobile' NOT NULL,
	"device_info" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit" integer,
	"rate_limit_ttl" integer,
	"last_used_at" timestamp with time zone,
	"last_used_ip" text,
	"request_count" integer DEFAULT 0 NOT NULL,
	"scopes" text[] DEFAULT '{}',
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "sync_status" "sync_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "sync_progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "sync_total_files" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "sync_processed_files" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "sync_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "sync_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "initial_sync_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "api_key_usage_log" ADD CONSTRAINT "api_key_usage_log_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_usage_log_key_id_idx" ON "api_key_usage_log" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "api_key_usage_log_timestamp_idx" ON "api_key_usage_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "api_key_usage_log_success_idx" ON "api_key_usage_log" USING btree ("success");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_type_idx" ON "api_keys" USING btree ("type");--> statement-breakpoint
CREATE INDEX "api_keys_is_enabled_idx" ON "api_keys" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "api_keys_last_used_at_idx" ON "api_keys" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "servers_sync_status_idx" ON "servers" USING btree ("sync_status");