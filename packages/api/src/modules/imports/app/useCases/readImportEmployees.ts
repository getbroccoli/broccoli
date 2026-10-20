import type { ImportReader } from "../../db";
import { groupEmployeeRecords, type ImportEmployee } from "../../domain";

/** Every import employee: the import's records grouped, with the owner's choices applied. */
export async function readImportEmployees(imports: ImportReader): Promise<ImportEmployee[]> {
  const [sources, records, choices] = await Promise.all([
    imports.listSources(),
    imports.listEmployeeRecords(),
    imports.listChoices("employee"),
  ]);
  return groupEmployeeRecords(sources, records, choices);
}
