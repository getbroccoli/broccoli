import type { SetupInviteAudience } from "../../../core/instance";
import type { ImportEmployee } from "./importEmployee";
import type { ImportManager } from "./importManagers";

/**
 * The people setup invites for `audience`, in `readyEmployees` order: nobody for only admins,
 * the ones who manage someone being added for admins and managers, else all. Never the owner's
 * own person, nor the person whose work email the owner signs in with, who could not join.
 */
export function setupInvitees(
  readyEmployees: readonly ImportEmployee[],
  managers: ReadonlyMap<string, ImportManager>,
  audience: SetupInviteAudience,
  ownerEmployeeKey: string | null,
  ownerEmail: string | null,
): ImportEmployee[] {
  if (audience === "only_admins") {
    return [];
  }
  const managerKeys = new Set(
    readyEmployees.flatMap(({ key }) => managers.get(key)?.manager?.key ?? []),
  );
  const owner = findOwnerCandidate(readyEmployees, ownerEmail);
  return readyEmployees.filter(
    ({ key }) =>
      key !== ownerEmployeeKey &&
      key !== owner?.key &&
      (audience === "everyone" || managerKeys.has(key)),
  );
}

/** The ready import employee whose work email is the owner's sign-in email, the person they likely are. */
export function findOwnerCandidate(
  readyEmployees: readonly ImportEmployee[],
  ownerEmail: string | null,
): ImportEmployee | null {
  const email = ownerEmail?.toLowerCase();
  return (
    (email && readyEmployees.find(({ values }) => values.email.value?.toLowerCase() === email)) ||
    null
  );
}
