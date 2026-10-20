import type { SecurityContext } from "../../../../core/security";
import { companyRepository } from "../../db";
import { type Company, type CompanyContext, readCompany } from "./company";

export async function removeLogo(context: CompanyContext, ctx: SecurityContext): Promise<Company> {
  ctx.requireSetupAccess();
  await context.transact((tx) => companyRepository(tx).replaceLogo(null));
  return readCompany(context);
}
