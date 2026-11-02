import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import {
  type AddApprovedPeople,
  createInstanceService,
  createSetupStepService,
} from "../../../core/instance";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { createEmployeeSetupService, type ImportedEmployees } from "../../employees";
import { lockImport } from "../db";
import { isReading, toNewEmployeeInput } from "../domain";
import { readImportReview } from "./importReview";
import { requireImportAccess } from "./requireImportAccess";

const setupSteps = createSetupStepService();
const instances = createInstanceService();
const employeeSetup = createEmployeeSetupService();

/** What adding the approved people did, published once it commits. */
export interface AddedPeople extends ImportedEmployees {
  /** The import employees that were selected, by their records and photo. */
  selected: { recordIds: string[]; photoFileId: string | null }[];
}

/** The owner's approval of the reviewed import, the people it adds, and reopening the review. */
export interface ImportApprovalService {
  /**
   * Completes the import step, adding the people only when that completes setup; otherwise the
   * last step adds them (`addApprovedPeople`). Refused while a file is being mapped, and when
   * the import no longer matches `version`, the `version` of `reads.readReview` the owner reviewed.
   */
  approveImport: (ctx: SecurityContext, version: string) => Promise<void>;
  /**
   * Turns the ready import employees that are not left out into employees, with the values, photo
   * and manager review shows, joining `tx`, in which the caller completes setup.
   */
  addApprovedPeople: AddApprovedPeople;
  /** Logs the people added once they are committed. */
  reportAddedPeople: (added: AddedPeople) => void;
  /**
   * Takes setup from the owner or ready step back to the import step, so the owner can change
   * the review; does nothing elsewhere. Leaving a demo started instead of the import deletes its people.
   */
  reopenReview: (ctx: SecurityContext) => Promise<void>;
}

export function createImportApprovalService({
  transact,
  logger,
}: Pick<ModuleDependencies, "transact" | "logger">): ImportApprovalService {
  return {
    async approveImport(ctx, version) {
      requireImportAccess(ctx);
      const approved = await transact(async (tx) => {
        // The step move locks the instance row, so a concurrent Approve waits and then finds
        // the step moved.
        if (!(await setupSteps.approveImportStep(ctx, tx))) {
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
        if ((await instances.readInstance(tx)).step === "done") {
          await addApprovedPeople(ctx, tx);
        }
        return true;
      });
      if (approved) {
        logger.info("Approved the import");
      }
    },
    addApprovedPeople,
    reportAddedPeople({ selected, ...counts }) {
      logger.info(counts, "Added the approved people");
      for (const employee of selected) {
        logger.info(employee, "Selected an import employee");
      }
    },
    async reopenReview(ctx) {
      requireImportAccess(ctx);
      const reopened = await transact(async (tx) => {
        if (!(await setupSteps.reopenImportStep(ctx, tx))) {
          return false;
        }
        if (await employeeSetup.hasDemoEmployees(ctx, tx)) {
          await employeeSetup.deleteAllEmployees(ctx, tx);
        }
        return true;
      });
      if (reopened) {
        logger.info("Reopened the review");
      }
    },
  };
}

async function addApprovedPeople(ctx: SecurityContext, tx: Tx): Promise<void> {
  requireImportAccess(ctx);
  await lockImport(tx);
  const { readyEmployees, managers } = await readImportReview(ctx, tx);
  const counts = await employeeSetup.createImportedEmployees(
    ctx,
    tx,
    readyEmployees.map((employee) => ({
      ...toNewEmployeeInput(employee),
      avatarFileId: employee.photoFileId ?? undefined,
      managerEmail: managers.get(employee.key)?.manager?.values.email.value,
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
