CREATE TABLE "managed_ticket" (
	"jti" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "managed_ticket_expires_at" ON "managed_ticket" USING btree ("expires_at");