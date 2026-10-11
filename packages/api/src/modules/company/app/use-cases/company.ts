import type { Orm } from "../../../../core/db";
import type { EventBus } from "../../../../core/events";
import { readOwner } from "../../../../core/instance";
import type { CompanyRepository } from "../../db";
import { suggestName } from "../../domain";

/** The largest company logo Broccoli stores. */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** The company as the owner sees it in the company step and later. */
export interface Company {
  name: string | null;
  suggestedName: string | null;
  logoId: string | null;
}

/** What the company use cases share. */
export interface CompanyContext {
  orm: Orm;
  eventBus: EventBus;
  companies: CompanyRepository;
}

/** Read after `requireOwner`, so the owner exists. */
export async function readCompany({ orm, companies }: CompanyContext): Promise<Company> {
  const [{ name, brandName, logoId }, owner] = await Promise.all([
    companies.read(),
    readOwner(orm),
  ]);
  if (!owner) {
    throw new Error("The instance has no owner");
  }
  return { name, suggestedName: suggestName({ brandName, ownerEmail: owner.email }), logoId };
}
