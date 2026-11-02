import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";

/** The owner's choice of their external agent as the AI source, and when that agent may work. */
export interface ExternalAgentChoiceService {
  /**
   * Makes the owner's external agent the AI source, in the caller's `tx` and holding the instance
   * row; refused like `lockExternalAgentChoice`.
   */
  chooseExternalAgentSource(ctx: SecurityContext, tx: Tx): Promise<void>;
  /**
   * Holds the instance row until `tx` ends for a change to the external agent; refused with
   * CONFLICT on a managed instance, once the owner exists or outside the import step.
   */
  lockExternalAgentChoice(ctx: SecurityContext, tx: Tx): Promise<void>;
  /**
   * Chooses the external agent for the command on the server, in the caller's `tx`, while
   * `canChooseExternalAgentOnServer`, so the owner finds Your agent selected. System only.
   */
  chooseExternalAgentOnServer(ctx: SecurityContext, tx: Tx): Promise<void>;
  /** Whether the external agent may work now (`isSetupOpenToExternalAgent`). Trusted read: no `ctx`. */
  readSetupOpenToExternalAgent(db: Orm | Tx, now: Date): Promise<boolean>;
  /**
   * Holds the instance row until `tx` ends, so a step move or another AI source cannot land before
   * the caller's write, then reads `clock`: that moment when the external agent may work then, else
   * null. Read after the wait for the lock, so no deadline passes unseen meanwhile.
   */
  lockSetupOpenToExternalAgent(tx: Tx, clock: () => Date): Promise<Date | null>;
}

export function createExternalAgentChoiceService(): ExternalAgentChoiceService {
  return {
    async chooseExternalAgentSource(ctx, tx) {
      await lockExternalAgentChoice(ctx, tx);
      await instanceRepository(tx).storeAiSource("external_agent");
    },
    lockExternalAgentChoice,
    async chooseExternalAgentOnServer(ctx, tx) {
      if (!ctx.isSystem) {
        throw new ApplicationError("FORBIDDEN", "Only the command on the server can do this.");
      }
      const repository = instanceRepository(tx);
      if ((await repository.lockInstance()).canChooseExternalAgentOnServer()) {
        await repository.storeAiSource("external_agent");
      }
    },
    readSetupOpenToExternalAgent: async (db, now) =>
      (await instanceRepository(db).readInstance()).isSetupOpenToExternalAgent(now),
    async lockSetupOpenToExternalAgent(tx, clock) {
      const instance = await instanceRepository(tx).lockInstance();
      const now = clock();
      return instance.isSetupOpenToExternalAgent(now) ? now : null;
    },
  };
}

async function lockExternalAgentChoice(ctx: SecurityContext, tx: Tx): Promise<void> {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
  if (!(await instanceRepository(tx).lockInstance()).canChooseExternalAgent()) {
    throw new ApplicationError(
      "CONFLICT",
      "Your agent can connect only while you gather your people.",
    );
  }
}
