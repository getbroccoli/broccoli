import { ApplicationError } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import {
  type AddApprovedPeople,
  createInstanceService,
  createSetupStepService,
} from "../../../core/instance";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";

const setupSteps = createSetupStepService();
const instances = createInstanceService();

/** The instance-wide setup beyond its steps: completing a managed setup and starting over. */
export interface SystemService {
  /**
   * Completes a managed setup once the owner has seen what it will add: adds the approved
   * people and publishes `instance.setup_completed`, in one transaction. Refused at any step
   * but `ready`, such as after another tab went back to the review.
   */
  completeSetup: (ctx: SecurityContext) => Promise<void>;
  /**
   * Starts a finished setup over: deletes every employee and takes setup back to the company
   * step, in one transaction; the company, the AI choice and the owner stay. Refused at any step
   * but `done`, and during the self-hosted demo, whose owner exits the demo instead.
   */
  resetSetup: (ctx: SecurityContext) => Promise<void>;
}

/** What the system service works with; the business modules provide the callbacks. */
export interface SystemServiceDependencies {
  transact: Transact;
  logger: Logger;
  /** Adds the people the owner approved when managed setup completes. */
  addApprovedPeople: AddApprovedPeople;
  /** Deletes every employee when the owner resets setup. */
  deleteAllEmployees: (ctx: SecurityContext, tx: Tx) => Promise<void>;
  /** Deletes what is left of the approved import when the owner resets setup. */
  deleteFinishedImport: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}

export function createSystemService({
  transact,
  logger,
  addApprovedPeople,
  deleteAllEmployees,
  deleteFinishedImport,
}: SystemServiceDependencies): SystemService {
  return {
    async completeSetup(ctx) {
      await transact(async (tx) => {
        if (!(await setupSteps.completeReadyStep(ctx, tx))) {
          throw new ApplicationError("CONFLICT", "Setup is not at the ready step.");
        }
        await addApprovedPeople(ctx, tx);
      });
    },
    async resetSetup(ctx) {
      ctx.require("RESET_WORKSPACE");
      await transact(async (tx) => {
        if ((await instances.readInstance(tx)).demoExpiresAt) {
          throw new ApplicationError("FORBIDDEN", "Exit the demo instead.");
        }
        // Moving the step first locks the instance row, so a concurrent reset waits and then refuses.
        if (!(await setupSteps.returnToCompanyStep(ctx, tx))) {
          throw new ApplicationError("CONFLICT", "Setup is not done.");
        }
        // A lost completion event can leave the import holding the employees' avatars.
        await deleteFinishedImport(ctx, tx);
        await deleteAllEmployees(ctx, tx);
      });
      logger.info("Reset setup");
    },
  };
}
