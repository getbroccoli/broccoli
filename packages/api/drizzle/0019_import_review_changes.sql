CREATE TABLE "import_review_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" text NOT NULL,
	"previous_choices" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
