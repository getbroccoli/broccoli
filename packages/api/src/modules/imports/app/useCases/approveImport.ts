import { ApplicationError } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import { approveImportStep, readInstance } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { createImportedEmployees, type ImportedEmployees } from "../../../employees";
import { lockImport } from "../../db";
import type { ImportContext } from "./importContext";
import { isReading, toNewEmployeeInput } from "../../domain";
import { readImportReview } from "./importReview";
import { requireImportAccess } from "./requireImportAccess";

/** What adding the approved people did, published once it commits. */
export interface AddedPeople extends ImportedEmployees {
  /** The import employees that were selected, by their records and photo. */
  selected: { recordIds: string[]; photoFileId: string | null }[];
}

declare module "../../../../core/events" {
  interface DomainEvents {
    /** The people the owner approved became employees. */
    "imports.people_added": AddedPeople;
  }
}

/**
 * Completes the import step, in one transaction; at any step but `import` it does nothing.
 * The people are added when setup completes (`addApprovedPeople`), here too when Approve
 * completes it. Refused while a file is being mapped, and when the import no longer matches
 * `version`, the one the owner reviewed, so nobody is added unseen.
 */
export async function approveImport(
  { transact, logger }: ImportContext,
  ctx: SecurityContext,
  version: string,
): Promise<void> {
  requireImportAccess(ctx);
  const approved = await transact(async (tx) => {
    // The step move locks the instance row, so a concurrent Approve waits and then finds
    // the step moved.
    if (!(await approveImportStep(ctx, tx))) {
      return false;
    }
    const imports = await lockImport(tx);
    if (isReading(await imports.listSources())) {
      throw new ApplicationError("CONFLICT", "Files are still being read.");
    }
    if ((await readImportReview(ctx, tx)).version !== version) {
      throw new ApplicationError("CONFLICT", "Your people changed while you were reviewing.");
    }
    // A self-hosted instance whose owner has an account has no last step to add them at.
    if ((await readInstance(tx)).step === "done") {
      await addApprovedPeople(ctx, tx);
    }
    return true;
  });
  if (approved) {
    logger.info("Approved the import");
  }
}

/**
 * Turns the ready import employees that are not left out into employees, with the values and
 * photo review shows, joining `tx`; the caller completes setup in the same transaction. All
 * photos stay with the import until setup completes.
 */
export async function addApprovedPeople(ctx: SecurityContext, tx: Tx): Promise<void> {
  requireImportAccess(ctx);
  await lockImport(tx);
  const { readyEmployees } = await readImportReview(ctx, tx);
  const counts = await createImportedEmployees(
    ctx,
    tx,
    readyEmployees.map((employee) => ({
      ...toNewEmployeeInput(employee),
      avatarFileId: employee.photoFileId ?? undefined,
    })),
  );
  tx.publish("imports.people_added", {
    ...counts,
    selected: readyEmployees.map(({ records, photoFileId }) => ({
      recordIds: records.map(({ id }) => id),
      photoFileId,
    })),
  });
}

/** Logs the people added once they are committed. */
export function reportAddedPeople(
  { logger }: Pick<ImportContext, "logger">,
  { selected, ...counts }: AddedPeople,
): void {
  logger.info(counts, "Added the approved people");
  for (const employee of selected) {
    logger.info(employee, "Selected an import employee");
  }
}
