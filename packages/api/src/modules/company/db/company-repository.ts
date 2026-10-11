import { randomUUID } from "node:crypto";

import { eq, isNull, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { Logo } from "../domain";
import { company } from "./company-table";

/** The company row without the logo bytes, which only `readLogo` loads. */
export interface CompanyRecord {
  name: string | null;
  brandName: string | null;
  logoId: string | null;
}

export type CompanyRepository = ReturnType<typeof companyRepository>;

/** The company stored in Postgres, through the pool or inside a transaction. */
export function companyRepository(db: Orm | Tx) {
  const orm = () => ormOf(db);
  return {
    read: async (): Promise<CompanyRecord> => {
      const [row] = await orm()
        .select({ name: company.name, brandName: company.brandName, logoId: company.logoId })
        .from(company);
      if (!row) {
        throw new Error("The company row is missing; migrations insert it");
      }
      return row;
    },

    saveName: async (name: string): Promise<void> => {
      await orm().update(company).set({ name });
    },

    /**
     * Stores the first brand lookup's result; does nothing once a lookup was stored,
     * so a repeated or late lookup never overrides the owner's changes.
     */
    saveBrandOnce: async (brandName: string | null, logo: Logo | null): Promise<void> => {
      await orm()
        .update(company)
        .set({
          brandName,
          brandLookedUpAt: sql`now()`,
          ...(logo && {
            logoId: randomUUID(),
            logoContent: logo.bytes,
            logoMimeType: logo.mimeType,
          }),
        })
        .where(isNull(company.brandLookedUpAt));
    },

    /** Also counts as the first lookup, so a lookup still running cannot bring the logo back. */
    removeLogo: async (): Promise<void> => {
      await orm()
        .update(company)
        .set({
          logoId: null,
          logoContent: null,
          logoMimeType: null,
          brandLookedUpAt: sql`coalesce(${company.brandLookedUpAt}, now())`,
        });
    },

    /** The logo with this id, or null when it is not the current one. */
    readLogo: async (logoId: string): Promise<Logo | null> => {
      const [row] = await orm()
        .select({ bytes: company.logoContent, mimeType: company.logoMimeType })
        .from(company)
        .where(eq(company.logoId, logoId));
      return row?.bytes ? { bytes: row.bytes, mimeType: row.mimeType as Logo["mimeType"] } : null;
    },
  };
}
