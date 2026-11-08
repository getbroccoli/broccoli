CREATE TABLE "employee_terms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"terms_id" uuid NOT NULL,
	"start_date" date,
	"end_date" date,
	CONSTRAINT "employee_terms_dates_in_order" CHECK ("employee_terms"."end_date" >= "employee_terms"."start_date")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"key" text,
	CONSTRAINT "terms_key_unique" UNIQUE("key")
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
	"time_off_policy_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entitlement_days" numeric,
	"entitlement_days_per_week" integer,
	"max_days" numeric,
	"after_years" integer,
	"extra_days" numeric,
	CONSTRAINT "time_off_allowance_rules_one_service_step" UNIQUE("time_off_policy_version_id","after_years"),
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
	"terms_id" uuid,
	"name" text,
	CONSTRAINT "time_off_policies_id_type_unique" UNIQUE("id","time_off_type_id"),
	CONSTRAINT "time_off_policies_terms_type_unique" UNIQUE("terms_id","time_off_type_id"),
	CONSTRAINT "time_off_policies_named_unless_terms" CHECK (("time_off_policies"."terms_id" is null) = ("time_off_policies"."name" is not null)),
	CONSTRAINT "time_off_policies_name_not_blank" CHECK (btrim("time_off_policies"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "time_off_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"time_off_policy_id" uuid NOT NULL,
	"start_date" date,
	"end_date" date,
	"balance" text NOT NULL,
	"bank_holidays" text,
	"leave_year_start" text,
	"leave_year_start_month" integer,
	"leave_year_start_day" integer,
	CONSTRAINT "time_off_policy_versions_dates_in_order" CHECK ("time_off_policy_versions"."end_date" >= "time_off_policy_versions"."start_date"),
	CONSTRAINT "time_off_policy_versions_bank_holidays_with_allowance" CHECK (("time_off_policy_versions"."bank_holidays" is not null) = ("time_off_policy_versions"."balance" = 'balance_from_allowance')),
	CONSTRAINT "time_off_policy_versions_leave_year_with_balance" CHECK (("time_off_policy_versions"."leave_year_start" is not null) = ("time_off_policy_versions"."balance" <> 'no_balance')),
	CONSTRAINT "time_off_policy_versions_fixed_date_month_set" CHECK (("time_off_policy_versions"."leave_year_start_month" is not null)
        = ("time_off_policy_versions"."leave_year_start" is not distinct from 'leave_year_from_fixed_date')),
	CONSTRAINT "time_off_policy_versions_fixed_date_day_set" CHECK (("time_off_policy_versions"."leave_year_start_day" is not null)
        = ("time_off_policy_versions"."leave_year_start" is not distinct from 'leave_year_from_fixed_date')),
	CONSTRAINT "time_off_policy_versions_fixed_date_valid" CHECK ("time_off_policy_versions"."leave_year_start_month" between 1 and 12 and "time_off_policy_versions"."leave_year_start_day" between 1 and
        case when "time_off_policy_versions"."leave_year_start_month" = 2 then 28
          when "time_off_policy_versions"."leave_year_start_month" in (4, 6, 9, 11) then 30 else 31 end)
);
--> statement-breakpoint
CREATE TABLE "time_off_policy_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"time_off_type_id" uuid NOT NULL,
	"time_off_policy_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	CONSTRAINT "time_off_policy_assignments_dates_in_order" CHECK ("time_off_policy_assignments"."end_date" >= "time_off_policy_assignments"."start_date")
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
	"unit" text DEFAULT 'day' NOT NULL,
	"icon" text,
	"colour" text,
	CONSTRAINT "time_off_types_type_key_unique" UNIQUE("type_key"),
	CONSTRAINT "time_off_types_unit_known" CHECK ("time_off_types"."unit" in ('day', 'hour'))
);
--> statement-breakpoint
ALTER TABLE "employee_terms" ADD CONSTRAINT "employee_terms_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_terms" ADD CONSTRAINT "employee_terms_terms_id_terms_id_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger_lines" ADD CONSTRAINT "allowance_ledger_lines_allowance_id_allowances_id_fk" FOREIGN KEY ("allowance_id") REFERENCES "public"."allowances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger_lines" ADD CONSTRAINT "allowance_ledger_lines_time_off_day_id_time_off_days_id_fk" FOREIGN KEY ("time_off_day_id") REFERENCES "public"."time_off_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger_lines" ADD CONSTRAINT "allowance_ledger_lines_allowance_rule_fk" FOREIGN KEY ("allowance_rule_id") REFERENCES "public"."time_off_allowance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_time_off_type_id_time_off_types_id_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_allowance_rules" ADD CONSTRAINT "time_off_allowance_rules_version_fk" FOREIGN KEY ("time_off_policy_version_id") REFERENCES "public"."time_off_policy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_days" ADD CONSTRAINT "time_off_days_time_off_id_time_off_id_fk" FOREIGN KEY ("time_off_id") REFERENCES "public"."time_off"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policies" ADD CONSTRAINT "time_off_policies_time_off_type_id_time_off_types_id_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policy_versions" ADD CONSTRAINT "time_off_policy_versions_policy_fk" FOREIGN KEY ("time_off_policy_id") REFERENCES "public"."time_off_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policy_assignments" ADD CONSTRAINT "time_off_policy_assignments_type_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policy_assignments" ADD CONSTRAINT "time_off_policy_assignments_policy_of_type_fk" FOREIGN KEY ("time_off_policy_id","time_off_type_id") REFERENCES "public"."time_off_policies"("id","time_off_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_time_off_type_id_time_off_types_id_fk" FOREIGN KEY ("time_off_type_id") REFERENCES "public"."time_off_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_terms_terms_idx" ON "employee_terms" USING btree ("terms_id");--> statement-breakpoint
CREATE INDEX "allowance_ledger_lines_allowance_idx" ON "allowance_ledger_lines" USING btree ("allowance_id");--> statement-breakpoint
CREATE INDEX "allowance_ledger_lines_allowance_rule_idx" ON "allowance_ledger_lines" USING btree ("allowance_rule_id");--> statement-breakpoint
CREATE INDEX "allowance_ledger_lines_time_off_day_idx" ON "allowance_ledger_lines" USING btree ("time_off_day_id");--> statement-breakpoint
CREATE INDEX "allowances_time_off_type_idx" ON "allowances" USING btree ("time_off_type_id");--> statement-breakpoint
CREATE INDEX "time_off_allowance_rules_version_idx" ON "time_off_allowance_rules" USING btree ("time_off_policy_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "time_off_allowance_rules_one_yearly_entitlement" ON "time_off_allowance_rules" USING btree ("time_off_policy_version_id") WHERE "time_off_allowance_rules"."kind" = 'yearly_entitlement';--> statement-breakpoint
CREATE UNIQUE INDEX "time_off_policies_type_name_unique" ON "time_off_policies" USING btree ("time_off_type_id",lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "time_off_policy_versions_policy_idx" ON "time_off_policy_versions" USING btree ("time_off_policy_id");--> statement-breakpoint
CREATE INDEX "time_off_policy_assignments_policy_idx" ON "time_off_policy_assignments" USING btree ("time_off_policy_id");--> statement-breakpoint
CREATE INDEX "time_off_employee_idx" ON "time_off" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "time_off_time_off_type_idx" ON "time_off" USING btree ("time_off_type_id");--> statement-breakpoint
-- Foreign keys to another module's tables, which drizzle cannot declare without importing them.
ALTER TABLE "time_off_policies" ADD CONSTRAINT "time_off_policies_terms_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_policy_assignments" ADD CONSTRAINT "time_off_policy_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A null bound is unbounded, as on employments.
ALTER TABLE "employee_terms" ADD CONSTRAINT "employee_terms_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "time_off_policy_versions" ADD CONSTRAINT "time_off_policy_versions_no_overlap" EXCLUDE USING gist ("time_off_policy_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "time_off_policy_assignments" ADD CONSTRAINT "time_off_policy_assignments_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, "time_off_type_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);--> statement-breakpoint
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, "time_off_type_id" WITH =, daterange("leave_year_start", "leave_year_end", '[]') WITH &&);--> statement-breakpoint
CREATE UNIQUE INDEX "time_off_types_name_unique" ON "time_off_types" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "terms_name_unique" ON "terms" USING btree (lower(btrim("name")));
