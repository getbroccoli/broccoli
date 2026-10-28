import { toast } from "sonner";

import { CancelInviteDocument, InviteEmployeesDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { addHistoryLine } from "@/features/records";
import { t } from "@/i18n";

import { addInviteHistoryLines } from "./cache";
import type { Invitee } from "./InviteDialog";
import { formatExpiryDay } from "./signInStatus";

type Props = {
  person: Invitee;
  /** Opens the invite dialog for this person. */
  onInvite: () => void;
};

/**
 * A person's invite actions in their panel's menu: copy a new link, invite, and cancel an open
 * invite. Nothing for someone who cannot be invited, such as someone who joined.
 */
export function InviteMenuItems({ person, onInvite }: Props) {
  const [invite] = usePayloadMutation(InviteEmployeesDocument, {
    update: (cache, { data }) => addInviteHistoryLines(cache, data?.employee.invite.invites ?? []),
  });
  const [cancel] = usePayloadMutation(CancelInviteDocument, {
    update: (cache, { data }) => {
      const line = data?.employee.cancelInvite.historyLine;
      if (line) addHistoryLine(cache, { recordType: "EMPLOYEE", recordId: person.id, line });
    },
  });
  const status = person.signInStatus;
  if (!status?.canBeInvited) return null;

  const copyLink = async () => {
    try {
      const { invites } = await invite({
        variables: { input: { employeeIds: [person.id], delivery: "COPIED_BY_OWNER" } },
      });
      const sent = invites?.[0];
      if (!sent?.link) throw new Error("No link");
      await navigator.clipboard.writeText(sent.link);
      toast(t("invites.panel.linkCopied", { date: formatExpiryDay(sent.expiresAt) }));
    } catch {
      toast.error(t("invites.panel.linkFailed"));
    }
  };

  const cancelInvite = async () => {
    try {
      await cancel({ variables: { input: { employeeId: person.id } } });
      toast(t("invites.panel.cancelled"));
    } catch {
      toast.error(t("invites.panel.cancelFailed"));
    }
  };

  return (
    <>
      <DropdownMenuItem onClick={() => void copyLink()}>
        {t("invites.panel.copyLink")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onInvite}>{t("invites.panel.invite")}</DropdownMenuItem>
      {status.state === "PENDING" && (
        <DropdownMenuItem onClick={() => void cancelInvite()}>
          {t("invites.panel.cancel")}
        </DropdownMenuItem>
      )}
    </>
  );
}
