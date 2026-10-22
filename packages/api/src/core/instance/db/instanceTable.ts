import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../../auth";
import { AI_SOURCES, OWNER_SIGN_IN_METHODS, SETUP_STEPS } from "../domain";

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
    /** Self-hosted only, while the owner is the demo's provisional one: when their access ends. */
    demoExpiresAt: timestamp("demo_expires_at", { withTimezone: true }),
    /** Managed instances only: what their signed init assigned; all three set or none. */
    managedCompanyId: text("managed_company_id"),
    managedPublicOrigin: text("managed_public_origin"),
    managedWebsiteOrigin: text("managed_website_origin"),
    /** Managed only: set by the first ticket that names the method, then never changed. */
    ownerSignInMethod: text("owner_sign_in_method", { enum: OWNER_SIGN_IN_METHODS }),
    /** Legacy relay token, moved to the data folder on first use. */
    encryptedBroccoliAiToken: text("encrypted_broccoli_ai_token"),
    /** Self-hosted only: where the owner chose to send AI decisions; null until they choose. */
    aiSource: text("ai_source", { enum: AI_SOURCES }),
    /** Self-hosted only: the OpenRouter key the owner pasted, encrypted. */
    encryptedOpenRouterKey: text("encrypted_openrouter_key"),
  },
  (table) => [
    check("instance_singleton", sql`${table.id}`),
    check(
      "instance_setup_step",
      sql`${table.setupStep} in ('company', 'import', 'owner', 'ready', 'done')`,
    ),
    check(
      "instance_setup_session",
      sql`num_nonnulls(${table.setupTokenHash}, ${table.setupExpiresAt}) in (0, 2)`,
    ),
    check(
      "instance_ai_source",
      sql`${table.aiSource} in ('broccoli_ai', 'openrouter', 'external_agent')`,
    ),
    check(
      "instance_owner_sign_in_method",
      sql`${table.ownerSignInMethod} in ('sign_in_with_google', 'sign_in_with_email')`,
    ),
    check(
      "instance_managed_assignment",
      sql`num_nonnulls(${table.managedCompanyId}, ${table.managedPublicOrigin}, ${table.managedWebsiteOrigin}) in (0, 3)`,
    ),
  ],
);
