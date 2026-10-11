import type { Orm, Tx } from "../../db";
import { instanceRepository } from "../db";
import type { SetupStep } from "../domain";

/** Where the instance is in its first-run flow. */
export function readSetupStep(orm: Orm): Promise<SetupStep> {
  return instanceRepository(orm).readStep();
}

/** Moves the setup step from `from` to `to`, joining `tx`; does nothing at any other step. */
export function advanceStep(tx: Tx, from: SetupStep, to: SetupStep): Promise<void> {
  return instanceRepository(tx).advanceStep(from, to);
}
