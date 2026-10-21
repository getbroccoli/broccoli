ALTER TABLE "import_sources" DROP CONSTRAINT "import_sources_status";--> statement-breakpoint
ALTER TABLE "import_sources" ADD COLUMN "original_read_allowed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_status" CHECK ("import_sources"."status" in ('mapping', 'mapped', 'failed', 'waiting_for_original_read_consent'));