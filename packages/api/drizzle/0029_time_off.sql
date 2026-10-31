CREATE TABLE "employee_policy_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"policy_group_id" uuid NOT NULL,
	"effective_from" date,
	"effective_until" date,
	CONSTRAINT "employee_policy_groups_dates_in_order" CHECK ("employee_policy_groups"."effective_until" >= "employee_policy_groups"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "policy_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"key" text,
	CONSTRAINT "policy_groups_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "allowance_ledger_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"allowance_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"unit" text NOT NULL,
	"amount" numeric NOT NULL,
	"kind" text NOT NULL,
	"cause_kind" text NOT NULL,
	"cause_ref" text,
	"allowance_rule_id" uuid,
	"time_off_day_id" uuid,
	"reason" text,
	"author_kind" text NOT NULL,
	"author_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowance_ledger_lines_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "allowance_ledger_lines_manual_adjustment_reason" CHECK ("allowance_ledger_lines"."kind" <> 'manual_adjustment' or "allowance_ledger_lines"."reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "allowances" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"time_off_type_id" uuid NOT NULL,
	"leave_year_start" date NOT NULL,
	"leave_year_end" date NOT NULL,
	CONSTRAINT "allowances_dates_in_order" CHECK ("allowances"."leave_year_end" >= "allowances"."leave_year_start")
);
--> statement-breakpoint
CREATE TABLE "time_off_allowance_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"time_off_policy_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entitlement_days" numeric,
	"entitlement_days_per_week" integer,
	"max_days" numeric,
	"after_years" integer,
	"extra_days" numeric,
	"removed_at" timestamp with time zone,
	CONSTRAINT "time_off_allowance_rules_yearly_entitlement_columns" CHECK ("time_off_allowance_rules"."kind" <> 'yearly_entitlement' or (
        "time_off_allowance_rules"."entitlement_days" is not null and "time_off_allowance_rules"."entitlement_days_per_week" is not null
        and "time_off_allowance_rules"."entitlement_days" >= 0 and "time_off_allowance_rules"."entitlement_days_per_week" between 1 and 7
        and ("time_off_allowance_rules"."max_days" is null or "time_off_allowance_rules"."max_days" >= 0)
        and "time_off_allowance_rules"."after_years" is null and "time_off_allowance_rules"."extra_days" is null)),
	CONSTRAINT "time_off_allowance_rules_service_extra_columns" CHECK ("time_off_allowance_rules"."kind" <> 'service_extra' or (
        "time_off_allowance_rules"."after_years" is not null and "time_off_allowance_rules"."extra_days" is not null
        and "time_off_allowance_rules"."after_years" >= 1 and "time_off_allowance_rules"."extra_days" >= 0
        and "time_off_allowance_rules"."entitlement_days" is null and "time_off_allowance_rules"."entitlement_days_per_week" is null
        and "time_off_allowance_rules"."max_days" is null))
);
--> statement-breakpoint
CREATE TABLE "time_off_days" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"time_off_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_part" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "time_off_days_time_off_date_unique" UNIQUE("time_off_id","date")
);
--> statement-breakpoint
CREATE TABLE "time_off_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"time_off_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"policy_group_id" uuid,
	"balance" text NOT NULL,
	"bank_holidays" text,
	"leave_year_start" text,
	"leave_year_start_month" integer,
	"leave_year_start_day" integer,
	CONSTRAINT "time_off_policies_group_type_unique" UNIQUE("policy_group_id","time_off_type_id"),
	CONSTRAINT "time_off_policies_id_type_unique" UNIQUE("id","time_off_type_id"),
	CONSTRAINT "time_off_policies_bank_holidays_with_allowance" CHECK (("time_off_policies"."bank_holidays" is not null) = ("time_off_policies"."balance" = 'balance_from_allowance')),
	CONSTRAINT "time_off_policies_leave_year_with_balance" CHECK (("time_off_policies"."leave_year_start" is not null) = ("time_off_policies"."balance" <> 'no_balance')),
	CONSTRAINT "time_off_policies_fixed_date_month_set" CHECK (("time_off_policies"."leave_year_start_month" is not null)
        = ("time_off_policies"."leave_year_start" is not distinct from 'leave_year_from_fixed_date')),
	CONSTRAINT "time_off_policies_fixed_date_day_set" CHECK (("time_off_policies"."leave_year_start_day" is not null)
        = ("time_off_policies"."leave_year_start" is not distinct from 'leave_year_from_fixed_date')),
	CONSTRAINT "time_off_policies_fixed_date_valid" CHECK ("time_off_policies"."leave_year_start_month" between 1 and 12 and "time_off_policies"."leave_year_start_day" between 1 and
        case when "time_off_policies"."leave_year_start_month" = 2 then 28
          when "time_off_policies"."leave_year_start_month" in (4, 6, 9, 11) then 30 else 31 end)
);
--> statement-breakpoint
CREATE TABLE "time_off_policy_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"time_off_type_id" uuid NOT NULL,
	"time_off_policy_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	CONSTRAINT "time_off_policy_assignments_dates_in_order" CHECK ("time_off_policy_assignments"."effective_until" >= "time_off_policy_assignments"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"time_off_type_id" uuid NOT NULL,
	"note" text,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_off_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"needs_approval" boolean NOT NULL,
	"private" boolean NOT NULL,
	"type_key" text,
	CONSTRAINT "time_off_types_type_key_unique" UNIQUE("type_key")
);
--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "bank_holiday_calendar" text DEFAULT 'england_and_wales' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_policy_groups" ADD CONSTRAINT "employee_policy_groups_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_policy_groups" ADD CONSTRAINT "employee_policy_groups_policy_group_id_policy_groups_id_fk" FOREIGN KEY ("policy_group_id") REFERENCES "public"."policy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger_lines" ADD CONSTRAINT "allowance_ledger_lines_allowance_id_allowances_id_fk" FOREIGN KEY ("allowance_id") REFERENCES "public"."allowances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger_lines" ADD CONSTRAINT "allowance_ledger_lines_time_off_day_id_time_off_days_id_fk" FOREIGN KEY ("time_off_day_id") REFERENCES "public"."time_off_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger_lines" ADD CONSTRAINT "allowance_ledger_lines_allowance_rule_fk" FOREIGN KEY ("allowance_rule_id") REFERENCES "public"."time_off_allowance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_time_off_type_id_time_off_types_id_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_allowance_rules" ADD CONSTRAINT "time_off_allowance_rules_policy_fk" FOREIGN KEY ("time_off_policy_id") REFERENCES "public"."time_off_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_days" ADD CONSTRAINT "time_off_days_time_off_id_time_off_id_fk" FOREIGN KEY ("time_off_id") REFERENCES "public"."time_off"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policies" ADD CONSTRAINT "time_off_policies_time_off_type_id_time_off_types_id_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policy_assignments" ADD CONSTRAINT "time_off_policy_assignments_type_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policy_assignments" ADD CONSTRAINT "time_off_policy_assignments_policy_of_type_fk" FOREIGN KEY ("time_off_policy_id","time_off_type_id") REFERENCES "public"."time_off_policies"("id","time_off_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_time_off_type_id_time_off_types_id_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_policy_groups_policy_group_idx" ON "employee_policy_groups" USING btree ("policy_group_id");--> statement-breakpoint
CREATE INDEX "allowance_ledger_lines_allowance_idx" ON "allowance_ledger_lines" USING btree ("allowance_id");--> statement-breakpoint
CREATE INDEX "allowance_ledger_lines_allowance_rule_idx" ON "allowance_ledger_lines" USING btree ("allowance_rule_id");--> statement-breakpoint
CREATE INDEX "allowance_ledger_lines_time_off_day_idx" ON "allowance_ledger_lines" USING btree ("time_off_day_id");--> statement-breakpoint
CREATE INDEX "allowances_time_off_type_idx" ON "allowances" USING btree ("time_off_type_id");--> statement-breakpoint
CREATE INDEX "time_off_allowance_rules_policy_idx" ON "time_off_allowance_rules" USING btree ("time_off_policy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "time_off_allowance_rules_one_yearly_entitlement" ON "time_off_allowance_rules" USING btree ("time_off_policy_id") WHERE "time_off_allowance_rules"."kind" = 'yearly_entitlement' and "time_off_allowance_rules"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "time_off_allowance_rules_one_service_step" ON "time_off_allowance_rules" USING btree ("time_off_policy_id","after_years") WHERE "time_off_allowance_rules"."kind" = 'service_extra' and "time_off_allowance_rules"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "time_off_policy_assignments_policy_idx" ON "time_off_policy_assignments" USING btree ("time_off_policy_id");--> statement-breakpoint
CREATE INDEX "time_off_employee_idx" ON "time_off" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "time_off_time_off_type_idx" ON "time_off" USING btree ("time_off_type_id");--> statement-breakpoint
-- Foreign keys to another module's tables, which drizzle cannot declare without importing them.
ALTER TABLE "time_off_policies" ADD CONSTRAINT "time_off_policies_policy_group_id_policy_groups_id_fk" FOREIGN KEY ("policy_group_id") REFERENCES "public"."policy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policy_assignments" ADD CONSTRAINT "time_off_policy_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A null bound is unbounded, as on employments.
ALTER TABLE "employee_policy_groups" ADD CONSTRAINT "employee_policy_groups_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, daterange("effective_from", "effective_until", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "time_off_policy_assignments" ADD CONSTRAINT "time_off_policy_assignments_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, "time_off_type_id" WITH =, daterange("effective_from", "effective_until", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, "time_off_type_id" WITH =, daterange("leave_year_start", "leave_year_end", '[]') WITH &&);
