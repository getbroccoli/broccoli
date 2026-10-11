import type { Actor } from "../../../../core/actor";
import type { ModuleDependencies } from "../../../../core/module-manifest";
import type { BrandLookup } from "../../brand-lookup";
import { companyRepository } from "../../db";
import { getCompany } from "./get-company";
import { onOwnerClaimed } from "./owner-claimed";
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
    getCompany: (actor: Actor | null) => getCompany(context, actor),
    setName: (actor: Actor | null, name: string) => setName(context, actor, name),
    removeLogo: (actor: Actor | null) => removeLogo(context, actor),
    readLogo: (actor: Actor | null, logoId: string) => readLogo(context, actor, logoId),
    onOwnerClaimed: (owner: { userId: string; email: string }) =>
      onOwnerClaimed({ companies, brandLookup, logger }, owner),
  };
}

export type CompanyUseCases = ReturnType<typeof createCompanyUseCases>;
