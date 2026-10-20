ALTER TABLE "instance" ADD COLUMN "ai_source" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "encrypted_openrouter_key" text;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_ai_source" CHECK ("instance"."ai_source" in ('broccoli_ai', 'openrouter'));