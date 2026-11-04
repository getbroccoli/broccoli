CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"default_terms_id" uuid,
	CONSTRAINT "locations_name_not_blank" CHECK (btrim("locations"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "location_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_name_unique" ON "locations" USING btree (lower(btrim("name")));--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_default_terms_id_terms_id_fk" FOREIGN KEY ("default_terms_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;
