CREATE TABLE "record_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "record_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"record_type" text NOT NULL,
	"record_id" text NOT NULL,
	"operation" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_kind" text NOT NULL,
	"author_id" text,
	"cause_kind" text NOT NULL,
	"cause_ref" text,
	"reason" text,
	"changes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "record_history_record_idx" ON "record_history" USING btree ("record_type","record_id","id");