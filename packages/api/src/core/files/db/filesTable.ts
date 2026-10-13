import { sql } from "drizzle-orm";
import { customType, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** Binary files of every module. A file never changes; the module that references it owns it. */
export const files = pgTable("files", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  content: bytea("content").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
