import type { Orm } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { setupHolderOf, type SetupHolder, type SetupStep } from "../domain";

/** Setup as one viewer may see it. */
export interface SetupView {
  step: SetupStep;
  holder: SetupHolder;
  /** When the demo ends; only its owner learns it. */
  demoExpiresAt: Date | null;
}

/**
 * Setup as `viewer` sees it, null before anyone signs in: the one application read without a
 * security context, because the web app asks it before any session exists.
 */
export async function readSetup(orm: Orm, viewer: SecurityContext | null): Promise<SetupView> {
  const instance = await instanceRepository(orm).readInstance();
  return {
    step: instance.step,
    // A live setup cookie made the viewer the setup holder; any other carries no live token.
    holder: viewer?.isSetupHolder ? "you" : setupHolderOf(instance, null, new Date()),
    demoExpiresAt: viewer?.user?.isOwner ? instance.demoExpiresAt : null,
  };
}
