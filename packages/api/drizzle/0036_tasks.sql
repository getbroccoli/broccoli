CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_employee_id" uuid NOT NULL,
	"asked_by_employee_id" uuid,
	"subject_employee_id" uuid,
	"process_key" text,
	"process_run_id" uuid,
	"step_key" text,
	"record_type" text,
	"record_id" text,
	"due_date" date,
	"done_at" timestamp with time zone,
	"done_by_employee_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_title_not_blank" CHECK (btrim("tasks"."title") <> ''),
	CONSTRAINT "tasks_asked_by_someone" CHECK ("tasks"."asked_by_employee_id" is not null or "tasks"."process_key" is not null),
	CONSTRAINT "tasks_process_source_complete" CHECK (("tasks"."process_key" is null) = ("tasks"."step_key" is null)
        and ("tasks"."process_run_id" is null or "tasks"."process_key" is not null)),
	CONSTRAINT "tasks_record_complete" CHECK (("tasks"."record_type" is null) = ("tasks"."record_id" is null)),
	CONSTRAINT "tasks_columns_follow_status" CHECK (("tasks"."status" = 'done') = ("tasks"."done_at" is not null)
        and ("tasks"."done_at" is null or "tasks"."cancelled_at" is null)
        and ("tasks"."status" = 'cancelled') = ("tasks"."cancelled_at" is not null)
        and ("tasks"."cancelled_at" is null) = ("tasks"."cancel_reason" is null)
        and ("tasks"."cancel_reason" is null or btrim("tasks"."cancel_reason") <> ''))
);
--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_employee_id");--> statement-breakpoint
CREATE INDEX "tasks_asked_by_idx" ON "tasks" USING btree ("asked_by_employee_id");--> statement-breakpoint
CREATE INDEX "tasks_record_idx" ON "tasks" USING btree ("record_type","record_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_employee_id_employees_id_fk" FOREIGN KEY ("assignee_employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_asked_by_employee_id_employees_id_fk" FOREIGN KEY ("asked_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_subject_employee_id_employees_id_fk" FOREIGN KEY ("subject_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_done_by_employee_id_employees_id_fk" FOREIGN KEY ("done_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
