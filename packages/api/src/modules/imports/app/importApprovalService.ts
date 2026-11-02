import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import {
  type AddApprovedPeople,
  createInstanceService,
  createSetupStepService,
  type SetupFinish,
  type SetupInvite,
} from "../../../core/instance";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import {
  createEmployeeSetupService,
  type EmployeeInviteService,
  type ImportedEmployees,
} from "../../employees";
import { lockImport } from "../db";
import { isReading, setupInvitees, toNewEmployeeInput } from "../domain";
import { readImportReview } from "./importReview";
import { requireImportAccess } from "./requireImportAccess";

const setupSteps = createSetupStepService();
const instances = createInstanceService();
const employeeSetup = createEmployeeSetupService();

/** What adding the approved people did, published once it commits. */
export interface AddedPeople extends ImportedEmployees {
  /** The import employees that were selected, by their records and photo. */
  selected: { recordIds: string[]; photoFileId: string | null }[];
  /** The employee the owner's user was linked to; null for none. */
  ownerEmployeeId: string | null;
  invitedEmployeeIds: string[];
}

/** Invites the people the owner chose as setup finishes; the employees module provides it. */
export type SetupInvites = Pick<EmployeeInviteService, "sendAtSetup">;

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
   * and manager review shows, joining `tx`, in which the caller completes setup; links the owner's
   * user to the person they said they are and invites the people they chose. Returns the invites.
   */
  addApprovedPeople: AddApprovedPeople;
  /** Logs the people added, the owner's link and the invites once they are committed. */
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
  invites,
  deleteAllEmployees,
}: Pick<ModuleDependencies, "transact" | "logger"> & {
  invites: SetupInvites;
  /** Deletes every employee and what goes with them, such as the groups' time off policies. */
  deleteAllEmployees: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}): ImportApprovalService {
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
          await addApprovedPeople(invites, ctx, tx);
        }
        return true;
      });
      if (approved) {
        logger.info("Approved the import");
      }
    },
    addApprovedPeople: (ctx, tx, finish) => addApprovedPeople(invites, ctx, tx, finish),
    reportAddedPeople({ selected, ownerEmployeeId, invitedEmployeeIds, ...counts }) {
      logger.info(counts, "Added the approved people");
      for (const employee of selected) {
        logger.info(employee, "Selected an import employee");
      }
      if (ownerEmployeeId) {
        logger.info({ employeeId: ownerEmployeeId }, "Linked the owner to their employee");
      }
      if (invitedEmployeeIds.length > 0) {
        logger.info({ employeeIds: invitedEmployeeIds }, "Invites created at setup");
      }
    },
    async reopenReview(ctx) {
      requireImportAccess(ctx);
      const reopened = await transact(async (tx) => {
        if (!(await setupSteps.reopenImportStep(ctx, tx))) {
          return false;
        }
        if (await employeeSetup.hasDemoEmployees(ctx, tx)) {
          await deleteAllEmployees(ctx, tx);
        }
        return true;
      });
      if (reopened) {
        logger.info("Reopened the review");
      }
    },
  };
}

/**
 * Adds the approved people joining `tx`; with `finish`, links the owner's user to the person they
 * said they are and invites the people they chose, returning those invites.
 */
async function addApprovedPeople(
  invites: SetupInvites,
  ctx: SecurityContext,
  tx: Tx,
  finish?: SetupFinish,
): Promise<SetupInvite[]> {
  requireImportAccess(ctx);
  await lockImport(tx);
  const { readyEmployees, managers } = await readImportReview(ctx, tx);
  const ownerKey = finish?.ownerEmployeeKey ?? null;
  const { idsByEmail, ...counts } = await employeeSetup.createImportedEmployees(
    ctx,
    tx,
    readyEmployees.map((employee) => ({
      ...toNewEmployeeInput(employee),
      avatarFileId: employee.photoFileId ?? undefined,
      managerEmail: managers.get(employee.key)?.manager?.values.email.value,
      locationName: employee.values.location.value,
      userId: employee.key === ownerKey ? finish?.ownerUserId : undefined,
    })),
    { kind: "ADDED_FROM_IMPORT" },
  );
  const idOf = (employee: { values: { email: { value: string | null } } }) =>
    idsByEmail.get(employee.values.email.value?.toLowerCase() ?? "");
  const owner = readyEmployees.find(({ key }) => key === ownerKey);
  const sent = finish
    ? await invites.sendAtSetup(
        ctx,
        tx,
        {
          employeeIds: setupInvitees(
            readyEmployees,
            managers,
            finish.inviteAudience,
            ownerKey,
            finish.ownerEmail,
          ).flatMap((employee) => idOf(employee) ?? []),
          note: finish.inviteNote,
          invitedByUserId: finish.ownerUserId,
        },
        finish.linkOrigin,
      )
    : [];
  tx.publish("imports.people_added", {
    ...counts,
    selected: readyEmployees.map(({ records, photoFileId }) => ({
      recordIds: records.map(({ id }) => id),
      photoFileId,
    })),
    ownerEmployeeId: (owner && idOf(owner)) ?? null,
    invitedEmployeeIds: sent.map(({ employee }) => employee.id),
  });
  return sent.map(({ employee, expiresAt, link }) => ({
    employeeId: employee.id,
    name: `${employee.firstName} ${employee.lastName}`,
    expiresAt,
    link,
  }));
}
