CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"content" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Moves the stored logo into files under its old id, so its cached URL keeps working.
INSERT INTO "files" ("id", "content", "mime_type")
SELECT "logo_id", "logo_content", "logo_mime_type" FROM "company" WHERE "logo_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "company" RENAME COLUMN "logo_id" TO "logo_file_id";--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" DROP COLUMN "logo_content";--> statement-breakpoint
ALTER TABLE "company" DROP COLUMN "logo_mime_type";