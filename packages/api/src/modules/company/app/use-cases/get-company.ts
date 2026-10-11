import { type Actor, requireOwner } from "../../../../core/actor";
import { type Company, type CompanyContext, readCompany } from "./company";

export async function getCompany(context: CompanyContext, actor: Actor | null): Promise<Company> {
  requireOwner(actor);
  return readCompany(context);
}
