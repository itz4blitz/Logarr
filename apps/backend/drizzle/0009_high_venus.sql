DROP INDEX "api_keys_type_idx";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "type";--> statement-breakpoint
DROP TYPE "public"."api_key_type";