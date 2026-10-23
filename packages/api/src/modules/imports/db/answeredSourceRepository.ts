import { and, eq, isNull, sql } from "drizzle-orm";

import { ormOf, type Tx } from "../../../core/db";
import type { ExternalAgentFileProgress } from "../domain";
import { importSources } from "./importSourcesTable";

/** What only the sources the external agent answers record, in a transaction holding the import's lock. */
export interface AnsweredSourceRepository {
  /** Records that the external agent picked the file up now, unless it already had. */
  recordPickup(id: string): Promise<void>;
  /** Records the stage the agent reports, also acknowledging receipt of the file. */
  recordProgress(id: string, progress: ExternalAgentFileProgress): Promise<void>;
}

export function answeredSourceRepository(tx: Tx): AnsweredSourceRepository {
  return {
    recordProgress: async (id, progress) => {
      await ormOf(tx)
        .update(importSources)
        .set({
          externalAgentProgress: progress,
          pickedUpByExternalAgentAt: sql`coalesce(${importSources.pickedUpByExternalAgentAt}, now())`,
        })
        .where(eq(importSources.id, id));
    },
    recordPickup: async (id) => {
      await ormOf(tx)
        .update(importSources)
        .set({ pickedUpByExternalAgentAt: sql`now()` })
        .where(and(eq(importSources.id, id), isNull(importSources.pickedUpByExternalAgentAt)));
    },
  };
}
