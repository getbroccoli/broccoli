import { type MessageKey, t } from "@/i18n";

import type { SetupInvites } from "./useSetupInvites";

/** The last page's button: what finishing does, with how many invites it sends or creates. */
export function finishLabel(
  { inviting, invitees, byEmail }: SetupInvites,
  plain: MessageKey,
  withInvites: MessageKey,
): string {
  if (!inviting || invitees.length === 0) {
    return t(plain);
  }
  const count = invitees.length;
  const action = byEmail
    ? count === 1
      ? t("setup.invites.sendOne")
      : t("setup.invites.send", { count: String(count) })
    : count === 1
      ? t("setup.invites.createLinkOne")
      : t("setup.invites.createLinks", { count: String(count) });
  return t(withInvites, { action });
}
