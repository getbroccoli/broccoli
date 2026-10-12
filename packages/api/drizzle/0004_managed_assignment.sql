ALTER TABLE "instance" ADD COLUMN "managed_company_id" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "managed_public_origin" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "managed_website_origin" text;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_managed_assignment" CHECK (num_nonnulls("instance"."managed_company_id", "instance"."managed_public_origin", "instance"."managed_website_origin") in (0, 3));