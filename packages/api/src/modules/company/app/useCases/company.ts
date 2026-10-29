import type { Orm, Transact } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";
import { companyRepository } from "../../db";
import { readOwner } from "../../../../core/instance";
import type { CompanyRepository } from "../../db";
import { suggestName } from "../../domain";

/** The largest company logo Broccoli stores. */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** The company as the owner sees it in the company step and later. */
export interface Company {
  name: string | null;
  suggestedName: string | null;
  logoFileId: string | null;
}

/** What the company use cases share. */
export interface CompanyContext {
  orm: Orm;
  transact: Transact;
  companies: CompanyRepository;
}

/** Called by the company use cases. */
export async function readCompany({ orm, companies }: CompanyContext): Promise<Company> {
  const [{ name, brandName, logoFileId }, owner] = await Promise.all([
    companies.read(),
    readOwner(orm),
  ]);
  return {
    name,
    suggestedName: suggestName({ brandName, ownerEmail: owner?.email ?? null }),
    logoFileId,
  };
}

/** The stored company, for Broccoli's own emails and pages, such as an invite's. */
export function readStoredCompany(ctx: SecurityContext, orm: Orm) {
  ctx.requireSystem();
  return companyRepository(orm).read();
}
