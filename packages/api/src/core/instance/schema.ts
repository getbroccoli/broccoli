import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "../auth";

export const ONBOARDING_STEPS = ["owner", "company", "done"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The one row describing this installation; the migration inserts it. */
export const instance = pgTable(
  "instance",
  {
    id: boolean("id").primaryKey().default(true),
    ownerUserId: text("owner_user_id").references(() => user.id),
    onboardingStep: text("onboarding_step", { enum: ONBOARDING_STEPS }).notNull().default("owner"),
  },
  (table) => [
    check("instance_singleton", sql`${table.id}`),
    check("instance_onboarding_step", sql`${table.onboardingStep} in ('owner', 'company', 'done')`),
  ],
);
