import type { Tx } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";
import { clearDemoEmployees, deleteAllEmployees } from "../../../employees";

/**
 * Deletes the demo's people, joining `tx`, when its owner resets setup: the demo company
 * with its avatar files, then anyone added during the demo.
 */
export async function resetDemoPeople(ctx: SecurityContext, tx: Tx): Promise<void> {
  await clearDemoEmployees(ctx, tx);
  await deleteAllEmployees(ctx, tx);
}
