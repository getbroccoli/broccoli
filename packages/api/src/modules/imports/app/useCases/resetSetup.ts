import { advanceStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { deleteImportedEmployees } from "../../../employees";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Takes setup from the owner step back to the company step and deletes the employees
 * Approve created, in one transaction; the company, the AI source and the import stay, so a
 * later Approve creates them again. At any other step it does nothing.
 */
export async function resetSetup(
  { transact }: Pick<ImportContext, "transact">,
  ctx: SecurityContext,
): Promise<void> {
  requireImportAccess(ctx);
  await transact(async (tx) => {
    if (await advanceStep(ctx, tx, "owner", "company")) {
      await deleteImportedEmployees(ctx, tx);
    }
  });
}
