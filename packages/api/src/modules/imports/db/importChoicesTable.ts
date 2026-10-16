import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * What the owner settled in review for one group of records of one type, such as the
 * employee records sharing an email. `values` follow the choices schema of `type` at
 * `type_version`; a pick of a record that is gone is ignored when read.
 */
export const importChoices = pgTable(
  "import_choices",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    type: text("type", { enum: ["employee"] }).notNull(),
    typeVersion: integer("type_version").notNull(),
    /** The group's key, such as an import employee's email. */
    key: text("key").notNull(),
    leftOut: boolean("left_out").notNull().default(false),
    values: jsonb("values").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("import_choices_type_key").on(table.type, table.key)],
);
