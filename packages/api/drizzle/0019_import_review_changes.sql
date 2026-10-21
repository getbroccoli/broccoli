CREATE TABLE "import_review_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"position" bigint GENERATED ALWAYS AS IDENTITY (sequence name "import_review_changes_position_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" text NOT NULL,
	"previous_choices" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
