import { ApplicationError } from "../../../../core/applicationError";
import { readInstance } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { clearDemoEmployees } from "../../../employees";
import type { DemoContext } from "./demoContext";

/**
 * Deletes every demo record; records people added stay. Refused while the demo's owner has
 * no account, who would be left with an empty app.
 */
export async function clearDemoData({ transact }: DemoContext, ctx: SecurityContext) {
  ctx.requireOwnerOrSystem();
  await transact(async (tx) => {
    if ((await readInstance(tx)).demoExpiresAt) {
      throw new ApplicationError("FORBIDDEN", "Create your account before clearing demo data.");
    }
    await clearDemoEmployees(ctx, tx);
  });
  return { isPresent: false };
}
