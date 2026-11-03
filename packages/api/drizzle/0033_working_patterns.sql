CREATE TABLE "employee_working_pattern_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"working_pattern_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	CONSTRAINT "employee_working_pattern_assignments_dates_in_order" CHECK ("employee_working_pattern_assignments"."effective_until" >= "employee_working_pattern_assignments"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "terms_working_patterns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"terms_id" uuid NOT NULL,
	"working_pattern_id" uuid NOT NULL,
	"effective_from" date,
	"effective_until" date,
	CONSTRAINT "terms_working_patterns_dates_in_order" CHECK ("terms_working_patterns"."effective_until" >= "terms_working_patterns"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "working_patterns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"key" text,
	CONSTRAINT "working_patterns_name_unique" UNIQUE("name"),
	CONSTRAINT "working_patterns_key_unique" UNIQUE("key"),
	CONSTRAINT "working_patterns_name_not_blank" CHECK (btrim("working_patterns"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "working_pattern_weeks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"working_pattern_id" uuid NOT NULL,
	"effective_from" date,
	"monday_minutes" integer NOT NULL,
	"tuesday_minutes" integer NOT NULL,
	"wednesday_minutes" integer NOT NULL,
	"thursday_minutes" integer NOT NULL,
	"friday_minutes" integer NOT NULL,
	"saturday_minutes" integer NOT NULL,
	"sunday_minutes" integer NOT NULL,
	"full_day_minutes" integer NOT NULL,
	CONSTRAINT "working_pattern_weeks_pattern_from_unique" UNIQUE NULLS NOT DISTINCT("working_pattern_id","effective_from"),
	CONSTRAINT "working_pattern_weeks_minutes_in_a_day" CHECK (least("working_pattern_weeks"."monday_minutes", "working_pattern_weeks"."tuesday_minutes", "working_pattern_weeks"."wednesday_minutes",
        "working_pattern_weeks"."thursday_minutes", "working_pattern_weeks"."friday_minutes", "working_pattern_weeks"."saturday_minutes",
        "working_pattern_weeks"."sunday_minutes") >= 0
        and greatest("working_pattern_weeks"."monday_minutes", "working_pattern_weeks"."tuesday_minutes", "working_pattern_weeks"."wednesday_minutes",
        "working_pattern_weeks"."thursday_minutes", "working_pattern_weeks"."friday_minutes", "working_pattern_weeks"."saturday_minutes",
        "working_pattern_weeks"."sunday_minutes") between 1 and "working_pattern_weeks"."full_day_minutes"),
	CONSTRAINT "working_pattern_weeks_full_day_in_a_day" CHECK ("working_pattern_weeks"."full_day_minutes" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "terms_time_off_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"terms_id" uuid NOT NULL,
	"time_off_type_id" uuid NOT NULL,
	"time_off_policy_id" uuid NOT NULL,
	"effective_from" date,
	"effective_until" date,
	CONSTRAINT "terms_time_off_policies_dates_in_order" CHECK ("terms_time_off_policies"."effective_until" >= "terms_time_off_policies"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "time_off_policies" DROP CONSTRAINT "time_off_policies_terms_type_unique";--> statement-breakpoint
ALTER TABLE "employments" DROP CONSTRAINT "employments_fte_range";--> statement-breakpoint
ALTER TABLE "employee_working_pattern_assignments" ADD CONSTRAINT "employee_working_pattern_assignments_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_working_pattern_assignments" ADD CONSTRAINT "employee_working_pattern_assignments_pattern_fk" FOREIGN KEY ("working_pattern_id") REFERENCES "public"."working_patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_working_patterns" ADD CONSTRAINT "terms_working_patterns_terms_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_working_patterns" ADD CONSTRAINT "terms_working_patterns_pattern_fk" FOREIGN KEY ("working_pattern_id") REFERENCES "public"."working_patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_pattern_weeks" ADD CONSTRAINT "working_pattern_weeks_pattern_fk" FOREIGN KEY ("working_pattern_id") REFERENCES "public"."working_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_time_off_policies" ADD CONSTRAINT "terms_time_off_policies_type_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_time_off_policies" ADD CONSTRAINT "terms_time_off_policies_policy_of_type_fk" FOREIGN KEY ("time_off_policy_id","time_off_type_id") REFERENCES "public"."time_off_policies"("id","time_off_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_working_pattern_assignments_pattern_idx" ON "employee_working_pattern_assignments" USING btree ("working_pattern_id");--> statement-breakpoint
CREATE INDEX "terms_working_patterns_pattern_idx" ON "terms_working_patterns" USING btree ("working_pattern_id");--> statement-breakpoint
CREATE INDEX "terms_time_off_policies_policy_idx" ON "terms_time_off_policies" USING btree ("time_off_policy_id");--> statement-breakpoint
ALTER TABLE "employments" DROP COLUMN "fte";--> statement-breakpoint
ALTER TABLE "time_off_policies" DROP COLUMN "terms_id";--> statement-breakpoint
ALTER TABLE "terms_time_off_policies" ADD CONSTRAINT "terms_time_off_policies_terms_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_time_off_policies" ADD CONSTRAINT "terms_time_off_policies_no_overlap" EXCLUDE USING gist ("terms_id" WITH =, "time_off_type_id" WITH =, daterange("effective_from", "effective_until", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "terms_working_patterns" ADD CONSTRAINT "terms_working_patterns_no_overlap" EXCLUDE USING gist ("terms_id" WITH =, daterange("effective_from", "effective_until", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "employee_working_pattern_assignments" ADD CONSTRAINT "employee_working_pattern_assignments_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, daterange("effective_from", "effective_until", '[]') WITH &&);
