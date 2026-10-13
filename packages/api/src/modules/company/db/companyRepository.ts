import { isNull, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import { company } from "./companyTable";

export interface CompanyRecord {
  name: string | null;
  brandName: string | null;
  logoFileId: string | null;
}

export type CompanyRepository = ReturnType<typeof companyRepository>;

/** The company stored in Postgres, through the pool or inside a transaction. */
export function companyRepository(db: Orm | Tx) {
  const orm = () => ormOf(db);
  return {
    read: async (): Promise<CompanyRecord> => {
      const [row] = await orm()
        .select({
          name: company.name,
          brandName: company.brandName,
          logoFileId: company.logoFileId,
        })
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
     * Stores the first brand lookup's result and returns true; does nothing and
     * returns false once a lookup was stored, so a repeated or late lookup never
     * overrides the owner's changes.
     */
    saveBrandOnce: async (
      brandName: string | null,
      logoFileId: string | null,
    ): Promise<boolean> => {
      const rows = await orm()
        .update(company)
        .set({ brandName, brandLookedUpAt: sql`now()`, ...(logoFileId && { logoFileId }) })
        .where(isNull(company.brandLookedUpAt))
        .returning({ id: company.id });
      return rows.length > 0;
    },

    /**
     * Sets the owner's own logo, or none, and returns the previous logo's file id.
     * Also counts as the first lookup, so a lookup still running cannot replace it.
     */
    replaceLogo: async (logoFileId: string | null): Promise<string | null> => {
      const [current] = await orm()
        .select({ logoFileId: company.logoFileId })
        .from(company)
        .for("update");
      await orm()
        .update(company)
        .set({ logoFileId, brandLookedUpAt: sql`coalesce(${company.brandLookedUpAt}, now())` });
      return current?.logoFileId ?? null;
    },
  };
}
