import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { files } from "../../../core/files";

/** The one row describing the company; the migration inserts it. */
export const company = pgTable(
  "company",
  {
    id: boolean("id").primaryKey().default(true),
    name: text("name"),
    brandName: text("brand_name"),
    /** A new file for every stored logo, so its URL can be cached for good. */
    logoFileId: uuid("logo_file_id").references(() => files.id),
    /** Set by the first brand lookup, whatever it found, so it never runs twice. */
    brandLookedUpAt: timestamp("brand_looked_up_at", { withTimezone: true }),
  },
  (table) => [check("company_singleton", sql`${table.id}`)],
);
