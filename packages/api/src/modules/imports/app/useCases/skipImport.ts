import { type Actor, requireOwner } from "../../../../core/actor";
import { runInTransaction } from "../../../../core/db";
import { advanceStep } from "../../../../core/instance";
import type { ImportContext } from "./importContext";

/** Leaves the import step of setup for now; the import's records stay. */
export async function skipImport({ orm, eventBus }: ImportContext, actor: Actor): Promise<void> {
  requireOwner(actor);
  await runInTransaction(orm, eventBus, (tx) => advanceStep(tx, "import", "done"));
}
