CREATE TABLE "user_permission_profiles" (
	"user_id" text NOT NULL,
	"profile" text NOT NULL,
	CONSTRAINT "user_permission_profiles_user_id_profile_pk" PRIMARY KEY("user_id","profile"),
	CONSTRAINT "user_permission_profiles_assignable" CHECK ("user_permission_profiles"."profile" in ('ADMIN'))
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "user_permission_profiles" ADD CONSTRAINT "user_permission_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_unique" UNIQUE("user_id");