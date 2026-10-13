import { type Actor, requireOwner } from "../../../../core/actor";
import { runInTransaction } from "../../../../core/db";
import { deleteFiles } from "../../../../core/files";
import { companyRepository } from "../../db";
import { type Company, type CompanyContext, readCompany } from "./company";

export async function removeLogo(context: CompanyContext, actor: Actor): Promise<Company> {
  requireOwner(actor);
  await runInTransaction(context.orm, context.eventBus, async (tx) => {
    const previousFileId = await companyRepository(tx).replaceLogo(null);
    await deleteFiles(tx, previousFileId ? [previousFileId] : []);
  });
  return readCompany(context);
}
