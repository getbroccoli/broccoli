import { sql } from "drizzle-orm";
import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const employees = pgTable(
  "employees",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull().unique("employees_email_unique"),
    jobTitle: text("job_title"),
    startDate: date("start_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Serves the list order, which is also the keyset of its cursor.
    index("employees_name_order_idx").on(
      sql`lower(${table.firstName})`,
      sql`lower(${table.lastName})`,
      table.id,
    ),
  ],
);
