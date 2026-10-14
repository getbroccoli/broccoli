import type { SecurityContext } from "../../../../core/security";
import { runInTransaction } from "../../../../core/db";
import { deleteFiles } from "../../../../core/files";
import { companyRepository } from "../../db";
import { type Company, type CompanyContext, readCompany } from "./company";

export async function removeLogo(context: CompanyContext, ctx: SecurityContext): Promise<Company> {
  ctx.requireOwnerOrSystem();
  await runInTransaction(context.orm, context.eventBus, async (tx) => {
    const previousFileId = await companyRepository(tx).replaceLogo(null);
    await deleteFiles(tx, previousFileId ? [previousFileId] : []);
  });
  return readCompany(context);
}
