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

import type { Company } from "./company";

export { MAX_LOGO_BYTES, type Company } from "./company";

/** Everything that can be done with the company; the adapters call nothing else. */
export interface CompanyUseCases {
  getCompany: (ctx: SecurityContext) => Promise<Company>;
  update: (ctx: SecurityContext, input: { name: string }) => Promise<Company>;
  saveLogo: (ctx: SecurityContext, bytes: Buffer) => Promise<Company>;
  removeLogo: (ctx: SecurityContext) => Promise<Company>;
  isCurrentLogo: (ctx: SecurityContext, fileId: string) => Promise<boolean>;
  detectCompanyNameAndLogo: (
    ctx: SecurityContext,
    owner: { userId: string; email: string },
  ) => Promise<void>;
}

export function createCompanyUseCases({
  orm,
  transact,
  logger,
  brandLookup,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  brandLookup: BrandLookup;
}): CompanyUseCases {
  const companies = companyRepository(orm);
  const context = { orm, transact, companies };
  return {
    getCompany: (ctx: SecurityContext) => getCompany(context, ctx),
    update: (ctx: SecurityContext, input: { name: string }) => updateCompany(context, ctx, input),
    saveLogo: (ctx: SecurityContext, bytes: Buffer) => saveLogo(context, ctx, bytes),
    removeLogo: (ctx: SecurityContext) => removeLogo(context, ctx),
    isCurrentLogo: (ctx: SecurityContext, fileId: string) => isCurrentLogo(context, ctx, fileId),
    detectCompanyNameAndLogo: (ctx: SecurityContext, owner: { userId: string; email: string }) =>
      detectCompanyNameAndLogo({ transact, brandLookup, logger }, ctx, owner),
  };
}
