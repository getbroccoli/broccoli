CREATE TABLE "process_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"process_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"definition_schema_version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_versions_number_unique" UNIQUE("process_id","version"),
	CONSTRAINT "process_versions_process_id_unique" UNIQUE("process_id","id"),
	CONSTRAINT "process_versions_status_known" CHECK ("process_versions"."status" in ('draft', 'published')),
	CONSTRAINT "process_versions_schema_version_positive" CHECK ("process_versions"."definition_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "processes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"active_version_id" uuid,
	"turned_on_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processes_key_unique" UNIQUE("key"),
	CONSTRAINT "processes_key_not_blank" CHECK (btrim("processes"."key") <> ''),
	CONSTRAINT "processes_name_not_blank" CHECK (btrim("processes"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "process_run_step_progress" (
	"run_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"status" text NOT NULL,
	"task_id" uuid,
	"assignee_note" text,
	"skip_reason" text,
	"finished_at" timestamp with time zone,
	"result_code" text,
	"result_comment" text,
	CONSTRAINT "process_run_step_progress_run_id_step_key_pk" PRIMARY KEY("run_id","step_key"),
	CONSTRAINT "process_run_step_progress_task_id_unique" UNIQUE("task_id"),
	CONSTRAINT "process_run_step_progress_key_not_blank" CHECK (btrim("process_run_step_progress"."step_key") <> ''),
	CONSTRAINT "process_run_step_progress_status_known" CHECK ("process_run_step_progress"."status" in ('step_waiting_to_start', 'step_awaiting_task_completion', 'step_completed', 'step_skipped', 'step_not_reached', 'step_cancelled')),
	CONSTRAINT "process_run_step_progress_assignee_note_known" CHECK ("process_run_step_progress"."assignee_note" in ('assignee_is_owner_because_subject_has_no_manager')),
	CONSTRAINT "process_run_step_progress_columns_follow_status" CHECK (("process_run_step_progress"."status" in ('step_waiting_to_start', 'step_awaiting_task_completion')) = ("process_run_step_progress"."finished_at" is null)
        and ("process_run_step_progress"."status" not in ('step_waiting_to_start', 'step_not_reached') or "process_run_step_progress"."task_id" is null)
        and ("process_run_step_progress"."status" = 'step_skipped') = ("process_run_step_progress"."skip_reason" is not null)
        and ("process_run_step_progress"."skip_reason" is null or "process_run_step_progress"."skip_reason" = 'no_assignee_for_step')
        and ("process_run_step_progress"."result_code" is null or "process_run_step_progress"."status" = 'step_completed')
        and ("process_run_step_progress"."result_comment" is null or "process_run_step_progress"."result_code" is not null))
);
--> statement-breakpoint
CREATE TABLE "process_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"process_id" uuid NOT NULL,
	"process_version_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"record_id" text NOT NULL,
	"subject_employee_id" uuid,
	"start_cause" text NOT NULL,
	"started_by_employee_id" uuid,
	"trigger_date" date,
	"start_key" text,
	"trigger_event" jsonb,
	"start_day" date NOT NULL,
	"status" text NOT NULL,
	"finished_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_employee_id" uuid,
	"cancel_cause" text,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_runs_status_known" CHECK ("process_runs"."status" in ('in_progress', 'finished', 'cancelled')),
	CONSTRAINT "process_runs_start_cause_known" CHECK ("process_runs"."start_cause" in ('started_on_record_date', 'started_by_admin', 'started_on_event')),
	CONSTRAINT "process_runs_trigger_event_follows_start_cause" CHECK (("process_runs"."start_cause" = 'started_on_event') = ("process_runs"."trigger_event" is not null)),
	CONSTRAINT "process_runs_cancel_cause_known" CHECK ("process_runs"."cancel_cause" in ('cancelled_because_step_assignee_was_removed', 'cancelled_because_subject_was_removed')),
	CONSTRAINT "process_runs_columns_follow_status" CHECK (("process_runs"."status" = 'finished') = ("process_runs"."finished_at" is not null)
        and ("process_runs"."status" = 'cancelled') = ("process_runs"."cancelled_at" is not null)
        and ("process_runs"."cancelled_at" is null) = ("process_runs"."cancel_cause" is null)
        and ("process_runs"."cancelled_at" is null) = ("process_runs"."cancel_reason" is null)
        and ("process_runs"."cancel_reason" is null or btrim("process_runs"."cancel_reason") <> ''))
);
--> statement-breakpoint
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_active_version_fk" FOREIGN KEY ("id","active_version_id") REFERENCES "public"."process_versions"("process_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_run_step_progress" ADD CONSTRAINT "process_run_step_progress_run_fk" FOREIGN KEY ("run_id") REFERENCES "public"."process_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_runs" ADD CONSTRAINT "process_runs_process_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_runs" ADD CONSTRAINT "process_runs_version_fk" FOREIGN KEY ("process_id","process_version_id") REFERENCES "public"."process_versions"("process_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "process_versions_one_draft_per_process" ON "process_versions" USING btree ("process_id") WHERE "process_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "process_runs_start_key_unique" ON "process_runs" USING btree ("process_id","start_key") WHERE "process_runs"."start_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "process_runs_one_in_progress_per_record" ON "process_runs" USING btree ("process_id","record_type","record_id") WHERE "process_runs"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "process_runs_process_status_idx" ON "process_runs" USING btree ("process_id","status");--> statement-breakpoint
CREATE INDEX "process_runs_record_idx" ON "process_runs" USING btree ("process_id","record_type","record_id");--> statement-breakpoint
CREATE INDEX "process_runs_subject_idx" ON "process_runs" USING btree ("subject_employee_id");--> statement-breakpoint
ALTER TABLE "process_runs" ADD CONSTRAINT "process_runs_started_by_employee_fk" FOREIGN KEY ("started_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_runs" ADD CONSTRAINT "process_runs_cancelled_by_employee_fk" FOREIGN KEY ("cancelled_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_run_step_progress" ADD CONSTRAINT "process_run_step_progress_task_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The ready-made Welcome a new starter, off, with its first published version active.
INSERT INTO "processes" ("key", "name", "description") VALUES (
	'welcome_new_starter',
	'Welcome a new starter',
	'Welcomes a new person on their start date: a 1:1 with their manager and coffee calls with colleagues.'
);--> statement-breakpoint
INSERT INTO "process_versions" ("process_id", "version", "status", "definition_schema_version", "definition")
	SELECT "id", 1, 'published', 1, '{
		"subject": { "recordType": "employee" },
		"trigger": { "kind": "on_record_date", "recordType": "employee", "dateField": "startDate",
			"offset": { "amount": 0, "unit": "calendar_days" }, "maxDaysLate": 7 },
		"steps": [
			{ "key": "welcome_one_to_one", "kind": "task", "task": {
				"assignee": { "kind": "subjects_manager", "otherwise": { "kind": "workspace_owner" } },
				"title": "Have a welcome 1:1 with {firstName}",
				"description": "Meet {firstName} on their first day: say hello, walk through their first week and answer their questions.",
				"due": { "amount": 0, "unit": "calendar_days" } } },
			{ "key": "coffee_calls", "kind": "task", "task": {
				"assignee": { "kind": "subject" },
				"title": "Have coffee calls with 3 colleagues",
				"description": "Book three short calls with people outside your team to get to know them.",
				"due": { "amount": 5, "unit": "business_days" } } }
		]
	}'::jsonb FROM "processes" WHERE "key" = 'welcome_new_starter';--> statement-breakpoint
UPDATE "processes" SET "active_version_id" = v."id" FROM "process_versions" v
	WHERE v."process_id" = "processes"."id" AND "processes"."key" = 'welcome_new_starter';--> statement-breakpoint
-- The ready-made Onboarding example, off: its last step waits for the accounts to be provisioned.
INSERT INTO "processes" ("key", "name", "description") VALUES (
	'onboarding_example',
	'Onboarding example',
	'Onboards a new person from their start date: a 1:1 with their manager, coffee breaks, and their accounts, which they check once provisioned.'
);--> statement-breakpoint
INSERT INTO "process_versions" ("process_id", "version", "status", "definition_schema_version", "definition")
	SELECT "id", 1, 'published', 1, '{
		"subject": { "recordType": "employee" },
		"trigger": { "kind": "on_record_date", "recordType": "employee", "dateField": "startDate",
			"offset": { "amount": 0, "unit": "calendar_days" }, "maxDaysLate": 7 },
		"steps": [
			{ "key": "one_to_one", "kind": "task", "after": [], "task": {
				"assignee": { "kind": "subjects_manager", "otherwise": { "kind": "workspace_owner" } },
				"title": "Have a 1:1 with {firstName}",
				"description": "Meet {firstName} in their first week to talk about their role, their first goals and how you will work together.",
				"due": { "amount": 0, "unit": "calendar_days" } } },
			{ "key": "coffee_breaks", "kind": "task", "after": [], "task": {
				"assignee": { "kind": "subject" },
				"title": "Have 3 random coffee breaks",
				"description": "Pick three colleagues you have not met yet and have a short coffee with each.",
				"due": { "amount": 5, "unit": "business_days" } } },
			{ "key": "provision_accounts", "kind": "task", "after": [], "task": {
				"assignee": { "kind": "workspace_owner" },
				"title": "Provision {firstName}''s accounts",
				"description": "Create {firstName}''s email and the accounts they need for their role, and send them their sign-in details.",
				"due": { "amount": 0, "unit": "calendar_days" } } },
			{ "key": "ensure_provision", "kind": "task", "after": ["provision_accounts"], "task": {
				"assignee": { "kind": "subject" },
				"title": "Check that your accounts work",
				"description": "Sign in to your email and the tools you were given, then tell us whether everything works.",
				"due": { "amount": 2, "unit": "business_days" },
				"resultForm": { "kind": "choice", "display": "buttons", "options": [
					{ "code": "yes", "label": "Yes" },
					{ "code": "no", "label": "No", "commentRequired": true } ] } } },
			{ "key": "fix_accounts", "kind": "task",
				"after": [{ "step": "ensure_provision", "when": { "result": "no" } }], "task": {
				"assignee": { "kind": "workspace_owner" },
				"title": "Fix {firstName}''s accounts",
				"description": "{firstName} says their accounts do not work. Fix them and tell {firstName}.",
				"due": { "amount": 1, "unit": "business_days" } } },
			{ "key": "welcome_lunch", "kind": "task", "join": "any",
				"after": ["fix_accounts", { "step": "ensure_provision", "when": { "result": "yes" } }], "task": {
				"assignee": { "kind": "subjects_manager", "otherwise": { "kind": "workspace_owner" } },
				"title": "Take {firstName} to lunch",
				"description": "Take {firstName} out for lunch to welcome them to the team.",
				"due": { "amount": 5, "unit": "business_days" } } }
		]
	}'::jsonb FROM "processes" WHERE "key" = 'onboarding_example';--> statement-breakpoint
UPDATE "processes" SET "active_version_id" = v."id" FROM "process_versions" v
	WHERE v."process_id" = "processes"."id" AND "processes"."key" = 'onboarding_example';
