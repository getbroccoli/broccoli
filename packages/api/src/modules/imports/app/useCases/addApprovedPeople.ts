import type { Tx } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";
import { createImportedEmployees, type ImportedEmployees } from "../../../employees";
import { lockImport } from "../../db";
import { toNewEmployeeInput } from "../../domain";
import type { ImportContext } from "./importContext";
import { readImportReview } from "./importReview";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Turns the ready import employees that are not left out into employees, with the values and
 * photo review shows, joining `tx`, in which the caller completes setup.
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
    { kind: "ADDED_FROM_IMPORT" },
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

/** What adding the approved people did, published once it commits. */
export interface AddedPeople extends ImportedEmployees {
  /** The import employees that were selected, by their records and photo. */
  selected: { recordIds: string[]; photoFileId: string | null }[];
}

declare module "../../../../core/records" {
  interface CauseKinds {
    /** People approved in the import, from a file or Slack, became employees. */
    ADDED_FROM_IMPORT: true;
  }
}

declare module "../../../../core/events" {
  interface DomainEvents {
    /** The people the owner approved became employees. */
    "imports.people_added": AddedPeople;
  }
}
