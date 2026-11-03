ALTER TABLE "time_off_policies" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "time_off_policies" ADD CONSTRAINT "time_off_policies_key_unique" UNIQUE("key");
