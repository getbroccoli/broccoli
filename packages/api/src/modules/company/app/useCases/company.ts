import type { Orm, Transact } from "../../../../core/db";
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

/** Called by the company use cases, which run only once setup has created the owner. */
export async function readCompany({ orm, companies }: CompanyContext): Promise<Company> {
  const [{ name, brandName, logoFileId }, owner] = await Promise.all([
    companies.read(),
    readOwner(orm),
  ]);
  if (!owner) {
    throw new Error("The instance has no owner");
  }
  return { name, suggestedName: suggestName({ brandName, ownerEmail: owner.email }), logoFileId };
}
