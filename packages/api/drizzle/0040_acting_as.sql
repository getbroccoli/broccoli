ALTER TABLE "session" ADD COLUMN "acting_as_employee_id" text;--> statement-breakpoint
ALTER TABLE "time_off" ADD COLUMN "created_by_employee_id" uuid;--> statement-breakpoint
CREATE INDEX "time_off_created_by_idx" ON "time_off" USING btree ("created_by_employee_id");--> statement-breakpoint
ALTER TABLE "time_off" DROP COLUMN "created_by_user_id";--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;