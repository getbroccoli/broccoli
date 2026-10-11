import type { Actor } from "../../../../core/actor";
import type { ModuleDependencies } from "../../../../core/module-manifest";
import type { BrandLookup } from "../../../../integrations/brand-lookup";
import { companyRepository } from "../../db";
import { getCompany } from "./get-company";
import { detectCompanyNameAndLogo } from "./detect-company-name-and-logo";
import { readLogo } from "./read-logo";
import { removeLogo } from "./remove-logo";
import { saveLogo } from "./save-logo";
import { updateCompany } from "./update-company";

export type { Company } from "./company";

/** Everything that can be done with the company; the adapters call nothing else. */
export function createCompanyUseCases({
  orm,
  eventBus,
  logger,
  brandLookup,
}: Pick<ModuleDependencies, "orm" | "eventBus" | "logger"> & { brandLookup: BrandLookup }) {
  const companies = companyRepository(orm);
  const context = { orm, eventBus, companies };
  return {
    getCompany: (actor: Actor) => getCompany(context, actor),
    update: (actor: Actor, input: { name: string }) => updateCompany(context, actor, input),
    saveLogo: (actor: Actor, bytes: Buffer) => saveLogo(context, actor, bytes),
    removeLogo: (actor: Actor) => removeLogo(context, actor),
    readLogo: (actor: Actor, logoId: string) => readLogo(context, actor, logoId),
    detectCompanyNameAndLogo: (owner: { userId: string; email: string }) =>
      detectCompanyNameAndLogo({ companies, brandLookup, logger }, owner),
  };
}

export type CompanyUseCases = ReturnType<typeof createCompanyUseCases>;
