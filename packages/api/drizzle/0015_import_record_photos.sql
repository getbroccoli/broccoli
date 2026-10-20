ALTER TABLE "import_records" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "import_records" ADD COLUMN "photo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;