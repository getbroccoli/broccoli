ALTER TABLE "instance" RENAME COLUMN "onboarding_step" TO "setup_step";--> statement-breakpoint
ALTER TABLE "instance" DROP CONSTRAINT "instance_onboarding_step";--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_setup_step" CHECK ("instance"."setup_step" in ('owner', 'company', 'done'));