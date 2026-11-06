CREATE TABLE "employee_working_pattern_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"working_pattern_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	CONSTRAINT "employee_working_pattern_assignments_dates_in_order" CHECK ("employee_working_pattern_assignments"."end_date" >= "employee_working_pattern_assignments"."start_date")
);
--> statement-breakpoint
CREATE TABLE "working_patterns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"terms_id" uuid,
	"name" text,
	CONSTRAINT "working_patterns_terms_unique" UNIQUE("terms_id"),
	CONSTRAINT "working_patterns_name_unique" UNIQUE("name"),
	CONSTRAINT "working_patterns_named_unless_terms" CHECK (("working_patterns"."terms_id" is null) = ("working_patterns"."name" is not null)),
	CONSTRAINT "working_patterns_name_not_blank" CHECK (btrim("working_patterns"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "working_pattern_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"working_pattern_id" uuid NOT NULL,
	"start_date" date,
	"end_date" date,
	"monday_minutes" integer NOT NULL,
	"tuesday_minutes" integer NOT NULL,
	"wednesday_minutes" integer NOT NULL,
	"thursday_minutes" integer NOT NULL,
	"friday_minutes" integer NOT NULL,
	"saturday_minutes" integer NOT NULL,
	"sunday_minutes" integer NOT NULL,
	"full_day_minutes" integer NOT NULL,
	"bank_holiday_calendar" text DEFAULT 'england_and_wales' NOT NULL,
	CONSTRAINT "working_pattern_versions_dates_in_order" CHECK ("working_pattern_versions"."end_date" >= "working_pattern_versions"."start_date"),
	CONSTRAINT "working_pattern_versions_minutes_in_a_day" CHECK (least("working_pattern_versions"."monday_minutes", "working_pattern_versions"."tuesday_minutes", "working_pattern_versions"."wednesday_minutes",
        "working_pattern_versions"."thursday_minutes", "working_pattern_versions"."friday_minutes", "working_pattern_versions"."saturday_minutes",
        "working_pattern_versions"."sunday_minutes") >= 0
        and greatest("working_pattern_versions"."monday_minutes", "working_pattern_versions"."tuesday_minutes", "working_pattern_versions"."wednesday_minutes",
        "working_pattern_versions"."thursday_minutes", "working_pattern_versions"."friday_minutes", "working_pattern_versions"."saturday_minutes",
        "working_pattern_versions"."sunday_minutes") between 1 and "working_pattern_versions"."full_day_minutes"),
	CONSTRAINT "working_pattern_versions_full_day_in_a_day" CHECK ("working_pattern_versions"."full_day_minutes" <= 1440),
	CONSTRAINT "working_pattern_versions_bank_holiday_calendar_known" CHECK ("working_pattern_versions"."bank_holiday_calendar" in ('england_and_wales', 'scotland', 'northern_ireland'))
);
--> statement-breakpoint
ALTER TABLE "employments" DROP CONSTRAINT "employments_fte_range";--> statement-breakpoint
ALTER TABLE "employee_working_pattern_assignments" ADD CONSTRAINT "employee_working_pattern_assignments_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_working_pattern_assignments" ADD CONSTRAINT "employee_working_pattern_assignments_pattern_fk" FOREIGN KEY ("working_pattern_id") REFERENCES "public"."working_patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_patterns" ADD CONSTRAINT "working_patterns_terms_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_pattern_versions" ADD CONSTRAINT "working_pattern_versions_pattern_fk" FOREIGN KEY ("working_pattern_id") REFERENCES "public"."working_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_working_pattern_assignments_pattern_idx" ON "employee_working_pattern_assignments" USING btree ("working_pattern_id");--> statement-breakpoint
ALTER TABLE "employments" DROP COLUMN "fte";--> statement-breakpoint
ALTER TABLE "working_pattern_versions" ADD CONSTRAINT "working_pattern_versions_no_overlap" EXCLUDE USING gist ("working_pattern_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "employee_working_pattern_assignments" ADD CONSTRAINT "employee_working_pattern_assignments_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);
