import type { SetupInviteAudience } from "../../../core/instance";
import type { ImportEmployee } from "./importEmployee";
import type { ImportManager } from "./importManagers";

/**
 * The people setup invites for `audience`, in `readyEmployees` order: nobody for only admins,
 * the ones who manage someone for admins and managers, else all; never the owner's own person.
 */
export function setupInvitees(
  readyEmployees: readonly ImportEmployee[],
  managers: ReadonlyMap<string, ImportManager>,
  audience: SetupInviteAudience,
  ownerEmployeeKey: string | null,
): ImportEmployee[] {
  if (audience === "only_admins") {
    return [];
  }
  const managerKeys = new Set([...managers.values()].flatMap(({ manager }) => manager?.key ?? []));
  return readyEmployees.filter(
    ({ key }) => key !== ownerEmployeeKey && (audience === "everyone" || managerKeys.has(key)),
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
