CREATE TABLE "external_agent_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"secret_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "external_agent_codes_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "external_agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token_hash" text NOT NULL,
	"client" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_call_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "external_agent_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "instance" DROP CONSTRAINT "instance_ai_source";--> statement-breakpoint
ALTER TABLE "import_sources" ADD COLUMN "read_by" text DEFAULT 'parsed_by_broccoli' NOT NULL;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_ai_source" CHECK ("instance"."ai_source" in ('broccoli_ai', 'openrouter', 'external_agent'));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_read_by" CHECK ("import_sources"."read_by" in ('parsed_by_broccoli', 'answered_by_external_agent'));