CREATE TABLE "employments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"direct_manager_id" uuid,
	"fte" integer DEFAULT 100 NOT NULL,
	"start_date" date,
	"end_date" date,
	CONSTRAINT "employments_fte_range" CHECK ("employments"."fte" between 1 and 100),
	CONSTRAINT "employments_not_own_manager" CHECK ("employments"."direct_manager_id" <> "employments"."employee_id")
);
--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_direct_manager_id_employees_id_fk" FOREIGN KEY ("direct_manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employments_direct_manager_idx" ON "employments" USING btree ("direct_manager_id");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
-- A null bound is unbounded, so an open employment overlaps every later one.
ALTER TABLE "employments" ADD CONSTRAINT "employments_no_overlap" EXCLUDE USING gist ("employee_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);
