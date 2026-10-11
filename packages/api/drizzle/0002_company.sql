CREATE TABLE "company" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"name" text,
	"brand_name" text,
	"logo_id" uuid,
	"logo_content" "bytea",
	"logo_mime_type" text,
	"brand_looked_up_at" timestamp with time zone,
	CONSTRAINT "company_singleton" CHECK ("company"."id")
);
--> statement-breakpoint
-- The single company row; the owner names it during setup.
INSERT INTO "company" DEFAULT VALUES;
