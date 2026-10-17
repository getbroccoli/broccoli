import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../../auth";
import { SETUP_STEPS } from "../domain";

/** The one row describing this installation; the migration inserts it. */
export const instance = pgTable(
  "instance",
  {
    id: boolean("id").primaryKey().default(true),
    ownerUserId: text("owner_user_id").references(() => user.id),
    setupStep: text("setup_step", { enum: SETUP_STEPS }).notNull().default("company"),
    /** Self-hosted only, before the owner exists: the hash of the setup holder's token. */
    setupTokenHash: text("setup_token_hash"),
    setupExpiresAt: timestamp("setup_expires_at", { withTimezone: true }),
    /** Managed instances only: what their signed init assigned; all three set or none. */
    managedCompanyId: text("managed_company_id"),
    managedPublicOrigin: text("managed_public_origin"),
    managedWebsiteOrigin: text("managed_website_origin"),
  },
  (table) => [
    check("instance_singleton", sql`${table.id}`),
    check("instance_setup_step", sql`${table.setupStep} in ('company', 'import', 'owner', 'done')`),
    check(
      "instance_setup_session",
      sql`num_nonnulls(${table.setupTokenHash}, ${table.setupExpiresAt}) in (0, 2)`,
    ),
    check(
      "instance_managed_assignment",
      sql`num_nonnulls(${table.managedCompanyId}, ${table.managedPublicOrigin}, ${table.managedWebsiteOrigin}) in (0, 3)`,
    ),
  ],
);
