import type { Tx } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";
import { parseParsedFileName, parseParsedPeople } from "../../domain";
import { lockOpenImport } from "./openImport";

/** Staff files the external agent read itself: their people arrive already parsed, with no file. */
export interface ParsedSourceService {
  /**
   * Adds the people as a mapped source named after their file, in the caller's `tx` under the
   * sources lock; returns its id, how many people became records and how many had no name or email.
   */
  addParsedSource(
    ctx: SecurityContext,
    tx: Tx,
    file: { name: unknown; people: unknown },
  ): Promise<{ id: string; people: number; skipped: number }>;
}

export function createParsedSourceService(): ParsedSourceService {
  return {
    addParsedSource: async (ctx, tx, { name, people }) => {
      ctx.requireSetupAgent();
      const fileName = parseParsedFileName(name);
      const { records, skipped } = parseParsedPeople(people);
      const imports = await lockOpenImport(tx);
      const id = await imports.insertFileSource(fileName, "parsed_by_external_agent");
      await imports.syncEmployeeRecords(id, records);
      return { id, people: records.length, skipped };
    },
  };
}
