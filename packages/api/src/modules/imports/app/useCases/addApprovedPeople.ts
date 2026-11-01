import type { Tx } from "../../../../core/db";
import type { SetupFinish, SetupInvite } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { createImportedEmployees, type ImportedEmployees } from "../../../employees";
import { lockImport } from "../../db";
import { setupInvitees, toNewEmployeeInput } from "../../domain";
import type { ImportContext } from "./importContext";
import { readImportReview } from "./importReview";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Turns the ready import employees that are not left out into employees, with the values, photo
 * and manager review shows, joining `tx`, in which the caller completes setup. With `finish`,
 * the owner's user is linked to the person they said they are and the people they chose are
 * invited; returns those invites.
 */
export async function addApprovedPeople(
  { invites }: Pick<ImportContext, "invites">,
  ctx: SecurityContext,
  tx: Tx,
  finish?: SetupFinish,
): Promise<SetupInvite[]> {
  requireImportAccess(ctx);
  await lockImport(tx);
  const { readyEmployees, managers } = await readImportReview(ctx, tx);
  const ownerKey = finish?.ownerEmployeeKey ?? null;
  const { idsByEmail, ...counts } = await createImportedEmployees(
    ctx,
    tx,
    readyEmployees.map((employee) => ({
      ...toNewEmployeeInput(employee),
      avatarFileId: employee.photoFileId ?? undefined,
      managerEmail: managers.get(employee.key)?.manager?.values.email.value,
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

/** Logs the people added, the owner's link and the invites once they are committed. */
export function reportAddedPeople(
  { logger }: Pick<ImportContext, "logger">,
  { selected, ownerEmployeeId, invitedEmployeeIds, ...counts }: AddedPeople,
): void {
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
}

/** What adding the approved people did, published once it commits. */
export interface AddedPeople extends ImportedEmployees {
  /** The import employees that were selected, by their records and photo. */
  selected: { recordIds: string[]; photoFileId: string | null }[];
  /** The employee the owner's user was linked to; null for none. */
  ownerEmployeeId: string | null;
  invitedEmployeeIds: string[];
}
