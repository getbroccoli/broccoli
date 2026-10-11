import { type Actor, requireOwner } from "../../../../core/actor";
import { invalidInput } from "../../../../core/application-error";
import { parseLogo } from "../../domain";
import { type Company, type CompanyContext, readCompany } from "./company";

/** Replaces the company logo with an image the owner uploaded. */
export async function saveLogo(
  context: CompanyContext,
  actor: Actor,
  bytes: Buffer,
): Promise<Company> {
  requireOwner(actor);
  const logo = parseLogo(bytes);
  if (!logo) {
    throw invalidInput([{ field: "logo", code: "invalid" }]);
  }
  await context.companies.saveLogo(logo);
  return readCompany(context);
}
