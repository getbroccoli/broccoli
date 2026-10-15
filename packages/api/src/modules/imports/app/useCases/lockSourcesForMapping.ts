import { ApplicationError } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import { readSetupStep } from "../../../../core/instance";
import { importRepository, type ImportRepository } from "../../db";

/**
 * Takes the sources lock that Approve takes too, so a new mapping run never slips past
 * it, and refuses one once setup is done: Approve runs only once.
 */
export async function lockSourcesForMapping(tx: Tx): Promise<ImportRepository> {
  const imports = importRepository(tx);
  await imports.lockSources();
  if ((await readSetupStep(tx)) === "done") {
    throw new ApplicationError("CONFLICT", "Setup is complete.");
  }
  return imports;
}
