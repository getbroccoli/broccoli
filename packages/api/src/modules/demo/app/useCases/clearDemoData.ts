import type { SecurityContext } from "../../../../core/security";
import { runInTransaction } from "../../../../core/db";
import { clearDemoEmployees } from "../../../employees";
import type { DemoContext } from "./demoContext";

/** Deletes every demo record; records people added stay. */
export async function clearDemoData({ orm, eventBus }: DemoContext, ctx: SecurityContext) {
  ctx.requireOwnerOrSystem();
  await runInTransaction(orm, eventBus, (tx) => clearDemoEmployees(ctx, tx));
  return { isPresent: false };
}
