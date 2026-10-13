import type { Actor } from "../../../../core/actor";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { BrandLookup } from "../../../../integrations/brandLookup";
import { companyRepository } from "../../db";
import { getCompany } from "./getCompany";
import { isCurrentLogo } from "./isCurrentLogo";
import { detectCompanyNameAndLogo } from "./detectCompanyNameAndLogo";
import { removeLogo } from "./removeLogo";
import { saveLogo } from "./saveLogo";
import { updateCompany } from "./updateCompany";

export { MAX_LOGO_BYTES, type Company } from "./company";

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
    isCurrentLogo: (actor: Actor, fileId: string) => isCurrentLogo(context, actor, fileId),
    detectCompanyNameAndLogo: (owner: { userId: string; email: string }) =>
      detectCompanyNameAndLogo({ orm, eventBus, brandLookup, logger }, owner),
  };
}

export type CompanyUseCases = ReturnType<typeof createCompanyUseCases>;
