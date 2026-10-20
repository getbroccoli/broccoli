CREATE TABLE "agent_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"secret_hash" text NOT NULL,
	"way" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "agent_codes_secret_hash_unique" UNIQUE("secret_hash"),
	CONSTRAINT "agent_codes_way" CHECK ("agent_codes"."way" in ('answers_masked_questions', 'parses_original_files'))
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token_hash" text NOT NULL,
	"way" text NOT NULL,
	"client" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_call_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "agent_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "agent_sessions_way" CHECK ("agent_sessions"."way" in ('answers_masked_questions', 'parses_original_files'))
);
--> statement-breakpoint
ALTER TABLE "instance" DROP CONSTRAINT "instance_ai_source";--> statement-breakpoint
ALTER TABLE "import_sources" DROP CONSTRAINT "import_sources_file";--> statement-breakpoint
ALTER TABLE "import_sources" ADD COLUMN "read_by" text DEFAULT 'parsed_by_broccoli' NOT NULL;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_ai_source" CHECK ("instance"."ai_source" in ('broccoli_ai', 'openrouter', 'agent'));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_read_by" CHECK ("import_sources"."read_by" in ('parsed_by_broccoli', 'answered_by_external_agent', 'parsed_by_external_agent'));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_file" CHECK (("import_sources"."kind" = 'file' and "import_sources"."read_by" <> 'parsed_by_external_agent') = ("import_sources"."file_id" is not null));