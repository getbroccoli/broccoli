import { sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import { deleteFiles, storeFile } from "../../../core/files";
import type { RasterImage } from "../../../utils";
import { company } from "./companyTable";

/** The company stored in Postgres, through the pool or inside a transaction. */
export interface CompanyRepository {
  read(): Promise<CompanyRecord>;
  saveName(name: string): Promise<void>;
  /**
   * Stores the first brand lookup's result, with its logo, if any; does nothing once a lookup
   * was stored, so a repeated or late lookup never overrides the owner's changes.
   */
  saveBrandOnce(brandName: string | null, logo: RasterImage | null): Promise<void>;
  /**
   * Stores the owner's own logo, or none, and deletes the previous logo's file. Also counts
   * as the first lookup, so a lookup still running cannot replace it.
   */
  replaceLogo(logo: RasterImage | null): Promise<void>;
}

export interface CompanyRecord {
  name: string | null;
  brandName: string | null;
  logoFileId: string | null;
}

export function companyRepository(db: Orm | Tx): CompanyRepository {
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

    saveBrandOnce: async (brandName: string | null, logo: RasterImage | null): Promise<void> => {
      const [current] = await orm()
        .select({ brandLookedUpAt: company.brandLookedUpAt })
        .from(company)
        .for("update");
      if (current?.brandLookedUpAt) {
        return;
      }
      const logoFileId = logo && (await storeLogo(db, logo));
      await orm()
        .update(company)
        .set({ brandName, brandLookedUpAt: sql`now()`, ...(logoFileId && { logoFileId }) });
    },

    replaceLogo: async (logo: RasterImage | null): Promise<void> => {
      const [current] = await orm()
        .select({ logoFileId: company.logoFileId })
        .from(company)
        .for("update");
      const logoFileId = logo && (await storeLogo(db, logo));
      await orm()
        .update(company)
        .set({ logoFileId, brandLookedUpAt: sql`coalesce(${company.brandLookedUpAt}, now())` });
      // After the update: a file the company still references cannot be deleted.
      await deleteFiles(db, current?.logoFileId ? [current.logoFileId] : []);
    },
  };
}

function storeLogo(db: Orm | Tx, logo: RasterImage): Promise<string> {
  return storeFile(db, { content: logo.bytes, mimeType: logo.mimeType });
}
