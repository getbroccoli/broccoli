import { and, eq, isNotNull, sql } from "drizzle-orm";

import { ormOf, type Tx } from "../../../core/db";
import type { AiSource } from "../../../core/instance";
import type { ImportSourceReader, MappingOutcome } from "../domain";
import { importSources } from "./importSourcesTable";

/** The owner's consent that AI reads a file in full, in a transaction holding the import's lock. */
export interface OriginalReadRepository {
  /**
   * Records the consent and starts a new run by `readBy`, keeping the file's records until it
   * ends; returns the run's attempt.
   */
  allowOriginalRead(id: string, readBy: ImportSourceReader): Promise<number>;
  /** Ends a read of a consented file, whatever its status, as the external agent may send again. */
  finishOriginalRead(id: string, outcome: MappingOutcome): Promise<void>;
  /** Records the actual model provider after the current original read succeeds. */
  recordOriginalReadAiSource(id: string, aiSource: AiSource | null): Promise<void>;
}

export function originalReadRepository(tx: Tx): OriginalReadRepository {
  return {
    allowOriginalRead: async (id, readBy) => {
      const [row] = await ormOf(tx)
        .update(importSources)
        .set({
          originalReadAllowedAt: sql`now()`,
          readBy,
          status: "mapping",
          failure: null,
          failureMessage: null,
          pickedUpByExternalAgentAt: null,
          mappingAttempt: sql`${importSources.mappingAttempt} + 1`,
        })
        .where(eq(importSources.id, id))
        .returning({ mappingAttempt: importSources.mappingAttempt });
      return row!.mappingAttempt;
    },

    finishOriginalRead: async (id, outcome) => {
      await ormOf(tx)
        .update(importSources)
        .set({
          status: outcome.status,
          failure: outcome.status === "failed" ? outcome.failure : null,
          failureMessage: null,
          readAt: sql`now()`,
          ...(outcome.status === "mapped"
            ? { originalReadAiSource: "external_agent" as const }
            : {}),
        })
        .where(and(eq(importSources.id, id), isNotNull(importSources.originalReadAllowedAt)));
    },

    recordOriginalReadAiSource: async (id, aiSource) => {
      await ormOf(tx)
        .update(importSources)
        .set({ originalReadAiSource: aiSource })
        .where(eq(importSources.id, id));
    },
  };
}
