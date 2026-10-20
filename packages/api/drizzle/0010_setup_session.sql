ALTER TABLE "instance" DROP CONSTRAINT "instance_setup_step";--> statement-breakpoint
ALTER TABLE "instance" ALTER COLUMN "setup_step" SET DEFAULT 'company';--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "setup_token_hash" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "setup_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_setup_session" CHECK (num_nonnulls("instance"."setup_token_hash", "instance"."setup_expires_at") in (0, 2));--> statement-breakpoint
-- An instance without an owner starts setup at the company step now.
UPDATE "instance" SET "setup_step" = 'company' WHERE "owner_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_setup_step" CHECK ("instance"."setup_step" in ('company', 'import', 'owner', 'done'));