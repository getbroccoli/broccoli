CREATE TABLE "import_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid NOT NULL,
	"type" text NOT NULL,
	"type_version" integer NOT NULL,
	"external_id" text NOT NULL,
	"raw" jsonb NOT NULL,
	"values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_records_source_record" UNIQUE("source_id","type","external_id")
);
--> statement-breakpoint
CREATE TABLE "import_sources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_sources_kind" CHECK ("import_sources"."kind" in ('slack'))
);
--> statement-breakpoint
CREATE TABLE "slack_connection" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"sealed_token" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_connection_singleton" CHECK ("slack_connection"."id")
);
--> statement-breakpoint
ALTER TABLE "instance" DROP CONSTRAINT "instance_setup_step";--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_source_id_import_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_sources_one_slack" ON "import_sources" USING btree ("kind") WHERE "import_sources"."kind" = 'slack';--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_setup_step" CHECK ("instance"."setup_step" in ('owner', 'company', 'import', 'done'));