import type { StoredFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { BrandLookup } from "../../../../integrations/brandLookup";
import { companyRepository } from "../../db";
import { getCompany } from "./getCompany";
import { detectCompanyNameAndLogo } from "./detectCompanyNameAndLogo";
import { readLogo } from "./readLogo";
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
  /** The current logo's file, or null when `fileId` is not the current logo. */
  readLogo: (ctx: SecurityContext, fileId: string) => Promise<StoredFile | null>;
  detectCompanyNameAndLogo: (
    ctx: SecurityContext,
    owner: { userId: string; email: string },
  ) => Promise<void>;
}

export { readStoredCompany } from "./company";

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
    readLogo: (ctx: SecurityContext, fileId: string) => readLogo(context, ctx, fileId),
    detectCompanyNameAndLogo: (ctx: SecurityContext, owner: { userId: string; email: string }) =>
      detectCompanyNameAndLogo({ orm, transact, brandLookup, logger }, ctx, owner),
  };
}
