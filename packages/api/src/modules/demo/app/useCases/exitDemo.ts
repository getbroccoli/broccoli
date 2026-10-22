import { ApplicationError } from "../../../../core/applicationError";
import { readInstance, returnToCompanyStepFromDemo } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { deleteAllEmployees, hasDemoEmployees } from "../../../employees";
import type { DemoContext } from "./demoContext";

/**
 * Ends the demo for an owner with an account: deletes every employee, the demo people and
 * anyone added, and takes setup back to the company step, in one transaction. The self-hosted
 * demo's owner, who has no account, exits through setup instead.
 */
export async function exitDemo({ transact }: DemoContext, ctx: SecurityContext) {
  ctx.requireOwnerOrSystem();
  await transact(async (tx) => {
    if ((await readInstance(tx)).demoExpiresAt) {
      throw new ApplicationError("FORBIDDEN", "Exit the demo through setup.");
    }
    // Moving the step first locks the instance row, so a concurrent exit waits and then refuses.
    if (!(await returnToCompanyStepFromDemo(ctx, tx)) || !(await hasDemoEmployees(ctx, tx))) {
      throw new ApplicationError("CONFLICT", "The instance holds no demo data.");
    }
    await deleteAllEmployees(ctx, tx);
  });
  return { isPresent: false };
}
