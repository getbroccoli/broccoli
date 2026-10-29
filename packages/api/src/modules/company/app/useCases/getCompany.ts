import type { SecurityContext } from "../../../../core/security";
import { type Company, type CompanyContext, readCompany } from "./company";

export async function getCompany(context: CompanyContext, ctx: SecurityContext): Promise<Company> {
  // Everyone signed in sees the company in their workspace menu.
  if (!ctx.user) {
    ctx.requireSetupAccess("MANAGE_WORKSPACE");
  }
  return readCompany(context);
}
