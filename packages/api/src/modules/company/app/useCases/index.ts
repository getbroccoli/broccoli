import type { SecurityContext } from "../../../../core/security";
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
    getCompany: (ctx: SecurityContext) => getCompany(context, ctx),
    update: (ctx: SecurityContext, input: { name: string }) => updateCompany(context, ctx, input),
    saveLogo: (ctx: SecurityContext, bytes: Buffer) => saveLogo(context, ctx, bytes),
    removeLogo: (ctx: SecurityContext) => removeLogo(context, ctx),
    isCurrentLogo: (ctx: SecurityContext, fileId: string) => isCurrentLogo(context, ctx, fileId),
    detectCompanyNameAndLogo: (ctx: SecurityContext, owner: { userId: string; email: string }) =>
      detectCompanyNameAndLogo({ orm, eventBus, brandLookup, logger }, ctx, owner),
  };
}

export type CompanyUseCases = ReturnType<typeof createCompanyUseCases>;
