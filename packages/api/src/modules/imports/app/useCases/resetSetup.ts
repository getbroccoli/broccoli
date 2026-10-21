import { returnToCompanyStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { deleteAllEmployees } from "../../../employees";
import { lockImport, originalReadRepository } from "../../db";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Takes setup from the owner or ready step back to the company step and deletes the employees
 * Approve created, in one transaction; the company, the AI source and the import stay, so a
 * later Approve creates them again, but the owner's consents to read files in full end. At any
 * other step it does nothing.
 */
export async function resetSetup(
  { transact }: Pick<ImportContext, "transact">,
  ctx: SecurityContext,
): Promise<void> {
  requireImportAccess(ctx);
  await transact(async (tx) => {
    if (await returnToCompanyStep(ctx, tx)) {
      await deleteAllEmployees(ctx, tx);
      // After the instance row, as every change of the import takes them.
      await lockImport(tx);
      await originalReadRepository(tx).clearOriginalReadConsents();
    }
  });
}
