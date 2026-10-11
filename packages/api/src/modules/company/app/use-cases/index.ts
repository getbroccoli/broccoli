import type { Actor } from "../../../../core/actor";
import type { ModuleDependencies } from "../../../../core/module-manifest";
import type { BrandLookup } from "../../brand-lookup";
import { companyRepository } from "../../db";
import { getCompany } from "./get-company";
import { detectCompanyNameAndLogo } from "./detect-company-name-and-logo";
import { readLogo } from "./read-logo";
import { removeLogo } from "./remove-logo";
import { setName } from "./set-name";

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
    setName: (actor: Actor, name: string) => setName(context, actor, name),
    removeLogo: (actor: Actor) => removeLogo(context, actor),
    readLogo: (actor: Actor, logoId: string) => readLogo(context, actor, logoId),
    detectCompanyNameAndLogo: (owner: { userId: string; email: string }) =>
      detectCompanyNameAndLogo({ companies, brandLookup, logger }, owner),
  };
}

export type CompanyUseCases = ReturnType<typeof createCompanyUseCases>;
