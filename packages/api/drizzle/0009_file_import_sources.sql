ALTER TABLE "import_sources" DROP CONSTRAINT "import_sources_kind";--> statement-breakpoint
ALTER TABLE "import_sources" ADD COLUMN "status" text DEFAULT 'mapped' NOT NULL;--> statement-breakpoint
ALTER TABLE "import_sources" ADD COLUMN "failure" text;--> statement-breakpoint
ALTER TABLE "import_sources" ADD COLUMN "mapping_attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_sources" ADD COLUMN "file_id" uuid;--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_status" CHECK ("import_sources"."status" in ('mapping', 'mapped', 'failed'));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_failure" CHECK (("import_sources"."status" = 'failed') = ("import_sources"."failure" is not null));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_file" CHECK (("import_sources"."kind" = 'file') = ("import_sources"."file_id" is not null));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_kind" CHECK ("import_sources"."kind" in ('slack', 'file'));