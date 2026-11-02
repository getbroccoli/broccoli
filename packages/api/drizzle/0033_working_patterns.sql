CREATE TABLE "employee_working_pattern_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"working_pattern_policy_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	CONSTRAINT "employee_working_pattern_assignments_dates_in_order" CHECK ("employee_working_pattern_assignments"."effective_until" >= "employee_working_pattern_assignments"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "policy_group_working_patterns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"policy_group_id" uuid NOT NULL,
	"working_pattern_policy_id" uuid NOT NULL,
	"effective_from" date,
	"effective_until" date,
	CONSTRAINT "policy_group_working_patterns_dates_in_order" CHECK ("policy_group_working_patterns"."effective_until" >= "policy_group_working_patterns"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "working_pattern_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"key" text,
	CONSTRAINT "working_pattern_policies_name_unique" UNIQUE("name"),
	CONSTRAINT "working_pattern_policies_key_unique" UNIQUE("key"),
	CONSTRAINT "working_pattern_policies_name_not_blank" CHECK (btrim("working_pattern_policies"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "working_pattern_weeks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"working_pattern_policy_id" uuid NOT NULL,
	"effective_from" date,
	"monday_minutes" integer NOT NULL,
	"tuesday_minutes" integer NOT NULL,
	"wednesday_minutes" integer NOT NULL,
	"thursday_minutes" integer NOT NULL,
	"friday_minutes" integer NOT NULL,
	"saturday_minutes" integer NOT NULL,
	"sunday_minutes" integer NOT NULL,
	"full_day_minutes" integer NOT NULL,
	CONSTRAINT "working_pattern_weeks_policy_from_unique" UNIQUE NULLS NOT DISTINCT("working_pattern_policy_id","effective_from"),
	CONSTRAINT "working_pattern_weeks_minutes_in_a_day" CHECK (least("working_pattern_weeks"."monday_minutes", "working_pattern_weeks"."tuesday_minutes", "working_pattern_weeks"."wednesday_minutes",
        "working_pattern_weeks"."thursday_minutes", "working_pattern_weeks"."friday_minutes", "working_pattern_weeks"."saturday_minutes",
        "working_pattern_weeks"."sunday_minutes") >= 0
        and greatest("working_pattern_weeks"."monday_minutes", "working_pattern_weeks"."tuesday_minutes", "working_pattern_weeks"."wednesday_minutes",
        "working_pattern_weeks"."thursday_minutes", "working_pattern_weeks"."friday_minutes", "working_pattern_weeks"."saturday_minutes",
        "working_pattern_weeks"."sunday_minutes") between 1 and "working_pattern_weeks"."full_day_minutes"),
	CONSTRAINT "working_pattern_weeks_full_day_in_a_day" CHECK ("working_pattern_weeks"."full_day_minutes" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "policy_group_time_off_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"policy_group_id" uuid NOT NULL,
	"time_off_type_id" uuid NOT NULL,
	"time_off_policy_id" uuid NOT NULL,
	"effective_from" date,
	"effective_until" date,
	CONSTRAINT "policy_group_time_off_policies_dates_in_order" CHECK ("policy_group_time_off_policies"."effective_until" >= "policy_group_time_off_policies"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "time_off_policies" DROP CONSTRAINT "time_off_policies_group_type_unique";--> statement-breakpoint
ALTER TABLE "employments" DROP CONSTRAINT "employments_fte_range";--> statement-breakpoint
ALTER TABLE "employee_working_pattern_assignments" ADD CONSTRAINT "employee_working_pattern_assignments_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_working_pattern_assignments" ADD CONSTRAINT "employee_working_pattern_assignments_policy_fk" FOREIGN KEY ("working_pattern_policy_id") REFERENCES "public"."working_pattern_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_group_working_patterns" ADD CONSTRAINT "policy_group_working_patterns_group_fk" FOREIGN KEY ("policy_group_id") REFERENCES "public"."policy_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_group_working_patterns" ADD CONSTRAINT "policy_group_working_patterns_policy_fk" FOREIGN KEY ("working_pattern_policy_id") REFERENCES "public"."working_pattern_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_pattern_weeks" ADD CONSTRAINT "working_pattern_weeks_policy_fk" FOREIGN KEY ("working_pattern_policy_id") REFERENCES "public"."working_pattern_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_group_time_off_policies" ADD CONSTRAINT "policy_group_time_off_policies_type_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_group_time_off_policies" ADD CONSTRAINT "policy_group_time_off_policies_policy_of_type_fk" FOREIGN KEY ("time_off_policy_id","time_off_type_id") REFERENCES "public"."time_off_policies"("id","time_off_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_working_pattern_assignments_policy_idx" ON "employee_working_pattern_assignments" USING btree ("working_pattern_policy_id");--> statement-breakpoint
CREATE INDEX "policy_group_working_patterns_policy_idx" ON "policy_group_working_patterns" USING btree ("working_pattern_policy_id");--> statement-breakpoint
CREATE INDEX "policy_group_time_off_policies_policy_idx" ON "policy_group_time_off_policies" USING btree ("time_off_policy_id");--> statement-breakpoint
ALTER TABLE "employments" DROP COLUMN "fte";--> statement-breakpoint
-- Moves each group's time off policy onto a dated link before its column goes.
INSERT INTO "policy_group_time_off_policies" ("policy_group_id", "time_off_type_id", "time_off_policy_id")
	SELECT "policy_group_id", "time_off_type_id", "id" FROM "time_off_policies" WHERE "policy_group_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "time_off_policies" DROP COLUMN "policy_group_id";--> statement-breakpoint
ALTER TABLE "policy_group_time_off_policies" ADD CONSTRAINT "policy_group_time_off_policies_group_fk" FOREIGN KEY ("policy_group_id") REFERENCES "public"."policy_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_group_time_off_policies" ADD CONSTRAINT "policy_group_time_off_policies_no_overlap" EXCLUDE USING gist ("policy_group_id" WITH =, "time_off_type_id" WITH =, daterange("effective_from", "effective_until", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "policy_group_working_patterns" ADD CONSTRAINT "policy_group_working_patterns_no_overlap" EXCLUDE USING gist ("policy_group_id" WITH =, daterange("effective_from", "effective_until", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "employee_working_pattern_assignments" ADD CONSTRAINT "employee_working_pattern_assignments_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, daterange("effective_from", "effective_until", '[]') WITH &&);--> statement-breakpoint
-- With nothing set up, everyone works Monday to Friday, 7.5 hours a day.
INSERT INTO "working_pattern_policies" ("name", "key") VALUES ('Standard', 'standard_working_pattern');--> statement-breakpoint
INSERT INTO "working_pattern_weeks" ("working_pattern_policy_id", "monday_minutes", "tuesday_minutes", "wednesday_minutes", "thursday_minutes", "friday_minutes", "saturday_minutes", "sunday_minutes", "full_day_minutes")
	SELECT "id", 450, 450, 450, 450, 450, 0, 0, 450 FROM "working_pattern_policies" WHERE "key" = 'standard_working_pattern';--> statement-breakpoint
INSERT INTO "policy_group_working_patterns" ("policy_group_id", "working_pattern_policy_id")
	SELECT g."id", p."id" FROM "policy_groups" g CROSS JOIN "working_pattern_policies" p
	WHERE g."key" = 'everyone' AND p."key" = 'standard_working_pattern';
