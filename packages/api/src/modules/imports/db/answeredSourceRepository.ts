import { and, eq, isNull, sql } from "drizzle-orm";

import { ormOf, type Tx } from "../../../core/db";
import { importSources } from "./importSourcesTable";

/** What only the sources the external agent answers record, in a transaction holding the import's lock. */
export interface AnsweredSourceRepository {
  /** Records that the external agent picked the file up now, unless it already had. */
  recordPickup(id: string): Promise<void>;
}

export function answeredSourceRepository(tx: Tx): AnsweredSourceRepository {
  return {
    recordPickup: async (id) => {
      await ormOf(tx)
        .update(importSources)
        .set({ pickedUpByExternalAgentAt: sql`now()` })
        .where(and(eq(importSources.id, id), isNull(importSources.pickedUpByExternalAgentAt)));
    },
  };
}
