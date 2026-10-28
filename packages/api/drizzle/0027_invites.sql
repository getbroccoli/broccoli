CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"profiles" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	"invited_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"send_failed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"replaced_at" timestamp with time zone,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_employee_idx" ON "invites" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_one_open_per_employee" ON "invites" USING btree ("employee_id") WHERE "invites"."accepted_at" is null and "invites"."cancelled_at" is null and "invites"."replaced_at" is null;