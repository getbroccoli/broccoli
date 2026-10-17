import type { SecurityContext } from "../../../../core/security";
import { deleteFiles } from "../../../../core/files";
import { companyRepository } from "../../db";
import { type Company, type CompanyContext, readCompany } from "./company";

export async function removeLogo(context: CompanyContext, ctx: SecurityContext): Promise<Company> {
  ctx.requireSetupAccess();
  await context.transact(async (tx) => {
    const previousFileId = await companyRepository(tx).replaceLogo(null);
    await deleteFiles(tx, previousFileId ? [previousFileId] : []);
  });
  return readCompany(context);
}
