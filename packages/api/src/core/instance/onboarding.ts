import { eq } from "drizzle-orm";

import { user } from "../auth";
import { type Orm, ormOf, type Tx } from "../db";
import { instance, type OnboardingStep } from "./schema";

/** Where the instance is in its first-run flow. */
export async function readOnboardingStep(orm: Orm): Promise<OnboardingStep> {
  const [row] = await orm.select({ step: instance.onboardingStep }).from(instance);
  if (!row) {
    throw new Error("The instance row is missing; migrations insert it");
  }
  return row.step;
}

/** Moves the onboarding step from `from` to `to`; does nothing at any other step. */
export async function advanceStep(tx: Tx, from: OnboardingStep, to: OnboardingStep): Promise<void> {
  await ormOf(tx)
    .update(instance)
    .set({ onboardingStep: to })
    .where(eq(instance.onboardingStep, from));
}

/** The owner's id and sign-in email, or null before an owner exists. */
export async function readOwner(orm: Orm): Promise<{ userId: string; email: string } | null> {
  const [row] = await orm
    .select({ userId: user.id, email: user.email })
    .from(instance)
    .innerJoin(user, eq(user.id, instance.ownerUserId));
  return row ?? null;
}
