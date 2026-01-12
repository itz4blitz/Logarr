CREATE TYPE "public"."audit_log_action" AS ENUM('create', 'update', 'delete', 'read', 'login', 'logout', 'error', 'export', 'import', 'sync', 'test', 'other');--> statement-breakpoint
CREATE TYPE "public"."audit_log_category" AS ENUM('auth', 'server', 'log_entry', 'session', 'playback', 'issue', 'ai_analysis', 'api_key', 'settings', 'retention', 'proxy', 'other');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"session_id" text,
	"action" "audit_log_action" NOT NULL,
	"category" "audit_log_category" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"description" text NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_time" integer NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"api_key_id" uuid,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_user_id_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_session_id_idx" ON "audit_log" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_category_idx" ON "audit_log" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_idx" ON "audit_log" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "audit_log_entity_id_idx" ON "audit_log" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_log_success_idx" ON "audit_log" USING btree ("success");--> statement-breakpoint
CREATE INDEX "audit_log_api_key_id_idx" ON "audit_log" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_timestamp_category" ON "audit_log" USING btree ("timestamp","category");--> statement-breakpoint
CREATE INDEX "idx_audit_log_user_action" ON "audit_log" USING btree ("user_id","action");