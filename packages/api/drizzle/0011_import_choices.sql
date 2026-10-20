CREATE TABLE "import_choices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" text NOT NULL,
	"type_version" integer NOT NULL,
	"key" text NOT NULL,
	"left_out" boolean DEFAULT false NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_choices_type_key" UNIQUE("type","key")
);
