ALTER TABLE "employees" ADD COLUMN "avatar_file_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;