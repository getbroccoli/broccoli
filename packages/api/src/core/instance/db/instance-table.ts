import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "../../auth";
import { SETUP_STEPS } from "../domain";

/** The one row describing this installation; the migration inserts it. */
export const instance = pgTable(
  "instance",
  {
    id: boolean("id").primaryKey().default(true),
    ownerUserId: text("owner_user_id").references(() => user.id),
    setupStep: text("setup_step", { enum: SETUP_STEPS }).notNull().default("owner"),
  },
  (table) => [
    check("instance_singleton", sql`${table.id}`),
    check("instance_setup_step", sql`${table.setupStep} in ('owner', 'company', 'done')`),
  ],
);
