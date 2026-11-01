ALTER TABLE "import_choices" ADD COLUMN "chosen_manager" jsonb;--> statement-breakpoint
ALTER TABLE "import_records" ADD COLUMN "external_record_id" text;