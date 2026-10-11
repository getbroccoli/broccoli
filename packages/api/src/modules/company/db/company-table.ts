import { sql } from "drizzle-orm";
import { boolean, check, customType, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** The one row describing the company; the migration inserts it. */
export const company = pgTable(
  "company",
  {
    id: boolean("id").primaryKey().default(true),
    name: text("name"),
    brandName: text("brand_name"),
    /** New for every stored logo, so its URL can be cached for good. */
    logoId: uuid("logo_id"),
    logoContent: bytea("logo_content"),
    logoMimeType: text("logo_mime_type"),
    /** Set by the first brand lookup, whatever it found, so it never runs twice. */
    brandLookedUpAt: timestamp("brand_looked_up_at", { withTimezone: true }),
  },
  (table) => [check("company_singleton", sql`${table.id}`)],
);
