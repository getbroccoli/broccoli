import type { SecurityContext } from "../../../../core/security";
import { type Company, type CompanyContext, readCompany } from "./company";

export async function getCompany(context: CompanyContext, ctx: SecurityContext): Promise<Company> {
  ctx.requireOwnerOrSystem();
  return readCompany(context);
}
