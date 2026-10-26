ALTER TABLE "instance" ADD COLUMN "mail_source" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "mail_from" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "encrypted_mail_secret" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "mail_link_origin" text;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_mail_source" CHECK ("instance"."mail_source" in ('smtp_server', 'resend_api', 'no_email'));