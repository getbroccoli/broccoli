import { type Actor, requireOwner } from "../../../../core/actor";
import { type Company, type CompanyContext, readCompany } from "./company";

export async function removeLogo(context: CompanyContext, actor: Actor): Promise<Company> {
  requireOwner(actor);
  await context.companies.removeLogo();
  return readCompany(context);
}
