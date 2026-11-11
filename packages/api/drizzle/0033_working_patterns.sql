CREATE TABLE "working_pattern_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"working_pattern_version_id" uuid NOT NULL,
	"employee_id" uuid,
	"terms_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date,
	CONSTRAINT "working_pattern_assignments_one_owner" CHECK (num_nonnulls("working_pattern_assignments"."employee_id", "working_pattern_assignments"."terms_id") = 1),
	CONSTRAINT "working_pattern_assignments_dates_in_order" CHECK ("working_pattern_assignments"."end_date" >= "working_pattern_assignments"."start_date")
);
--> statement-breakpoint
CREATE TABLE "working_patterns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text,
	CONSTRAINT "working_patterns_name_unique" UNIQUE("name"),
	CONSTRAINT "working_patterns_name_not_blank" CHECK (btrim("working_patterns"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "working_pattern_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"working_pattern_id" uuid NOT NULL,
	"status" text NOT NULL,
	"terms_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"monday_minutes" integer NOT NULL,
	"tuesday_minutes" integer NOT NULL,
	"wednesday_minutes" integer NOT NULL,
	"thursday_minutes" integer NOT NULL,
	"friday_minutes" integer NOT NULL,
	"saturday_minutes" integer NOT NULL,
	"sunday_minutes" integer NOT NULL,
	"bank_holiday_calendar" text DEFAULT 'england_and_wales' NOT NULL,
	CONSTRAINT "working_pattern_versions_status_known" CHECK ("working_pattern_versions"."status" in ('draft', 'published')),
	CONSTRAINT "working_pattern_versions_terms_only_on_draft" CHECK (("working_pattern_versions"."terms_id" is not null) = ("working_pattern_versions"."status" = 'draft')),
	CONSTRAINT "working_pattern_versions_minutes_in_a_day" CHECK (least("working_pattern_versions"."monday_minutes", "working_pattern_versions"."tuesday_minutes", "working_pattern_versions"."wednesday_minutes",
        "working_pattern_versions"."thursday_minutes", "working_pattern_versions"."friday_minutes", "working_pattern_versions"."saturday_minutes",
        "working_pattern_versions"."sunday_minutes") >= 0
        and greatest("working_pattern_versions"."monday_minutes", "working_pattern_versions"."tuesday_minutes", "working_pattern_versions"."wednesday_minutes",
        "working_pattern_versions"."thursday_minutes", "working_pattern_versions"."friday_minutes", "working_pattern_versions"."saturday_minutes",
        "working_pattern_versions"."sunday_minutes") between 1 and 1440),
	CONSTRAINT "working_pattern_versions_bank_holiday_calendar_known" CHECK ("working_pattern_versions"."bank_holiday_calendar" in ('england_and_wales', 'scotland', 'northern_ireland'))
);
--> statement-breakpoint
ALTER TABLE "employments" DROP CONSTRAINT "employments_fte_range";--> statement-breakpoint
ALTER TABLE "working_pattern_assignments" ADD CONSTRAINT "working_pattern_assignments_version_fk" FOREIGN KEY ("working_pattern_version_id") REFERENCES "public"."working_pattern_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_pattern_assignments" ADD CONSTRAINT "working_pattern_assignments_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_pattern_assignments" ADD CONSTRAINT "working_pattern_assignments_terms_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_pattern_versions" ADD CONSTRAINT "working_pattern_versions_pattern_fk" FOREIGN KEY ("working_pattern_id") REFERENCES "public"."working_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_pattern_versions" ADD CONSTRAINT "working_pattern_versions_terms_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "working_pattern_assignments_version_idx" ON "working_pattern_assignments" USING btree ("working_pattern_version_id");--> statement-breakpoint
CREATE INDEX "working_pattern_assignments_terms_idx" ON "working_pattern_assignments" USING btree ("terms_id");--> statement-breakpoint
CREATE UNIQUE INDEX "working_pattern_versions_one_draft_per_terms" ON "working_pattern_versions" USING btree ("working_pattern_id","terms_id") WHERE "working_pattern_versions"."status" = 'draft';--> statement-breakpoint
ALTER TABLE "employments" DROP COLUMN "fte";--> statement-breakpoint
ALTER TABLE "working_pattern_assignments" ADD CONSTRAINT "working_pattern_assignments_employee_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&) WHERE ("employee_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "working_pattern_assignments" ADD CONSTRAINT "working_pattern_assignments_terms_no_overlap" EXCLUDE USING gist ("terms_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&) WHERE ("terms_id" IS NOT NULL);
