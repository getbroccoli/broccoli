import type { Orm, Tx } from "../../db";
import { instanceRepository } from "../db";
import type { OnboardingStep } from "../domain";

/** Where the instance is in its first-run flow. */
export function readOnboardingStep(orm: Orm): Promise<OnboardingStep> {
  return instanceRepository(orm).readStep();
}

/** Moves the onboarding step from `from` to `to`, joining `tx`; does nothing at any other step. */
export function advanceStep(tx: Tx, from: OnboardingStep, to: OnboardingStep): Promise<void> {
  return instanceRepository(tx).advanceStep(from, to);
}
