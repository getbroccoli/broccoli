import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../core/db";
import { createInstanceService, createSetupStepService } from "../../../core/instance";
import type { SecurityContext } from "../../../core/security";
import { createEmployeeSetupService } from "../../employees";

const employeeSetup = createEmployeeSetupService();
const setupSteps = createSetupStepService();
const instances = createInstanceService();

/** Everything that can be done with demo data; the adapters call nothing else. */
export interface DemoService {
  /** Whether the instance holds demo data. */
  getDemoData: (ctx: SecurityContext) => Promise<{ isPresent: boolean }>;
  /**
   * Ends the demo for an owner with an account: deletes every employee, the demo people and
   * anyone added, and takes setup back to the company step, in one transaction. The self-hosted
   * demo's owner, who has no account, exits through setup instead.
   */
  exitDemo: (ctx: SecurityContext) => Promise<{ isPresent: boolean }>;
}

export function createDemoService({
  orm,
  transact,
  deleteAllEmployees,
}: {
  orm: Orm;
  transact: Transact;
  /** Deletes every employee and what goes with them, such as the terms' time off policies. */
  deleteAllEmployees: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}): DemoService {
  return {
    async getDemoData(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return { isPresent: await employeeSetup.hasDemoEmployees(ctx, orm) };
    },
    async exitDemo(ctx) {
      ctx.require("RESET_WORKSPACE");
      await transact(async (tx) => {
        if ((await instances.readInstance(tx)).demoExpiresAt) {
          throw new ApplicationError("FORBIDDEN", "Exit the demo through setup.");
        }
        // Moving the step first locks the instance row, so a concurrent exit waits and then refuses.
        if (
          !(await setupSteps.returnToCompanyStep(ctx, tx)) ||
          !(await employeeSetup.hasDemoEmployees(ctx, tx))
        ) {
          throw new ApplicationError("CONFLICT", "The instance holds no demo data.");
        }
        await deleteAllEmployees(ctx, tx);
      });
      return { isPresent: false };
    },
  };
}
