import type { Orm, Transact } from "../../../../core/db";
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

/** The company's name, for other modules' emails and pages; empty before setup names it. */
export async function readCompanyName(orm: Orm): Promise<string> {
  return (await companyRepository(orm).read()).name ?? "";
}
