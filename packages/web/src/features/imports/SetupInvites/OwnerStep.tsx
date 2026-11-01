import { useState } from "react";

import { OwnerSetupForm, type SetupInviteSearch, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

import { ApprovedPeopleSummary } from "../ApprovedPeopleSummary";
import { BackToWho } from "./BackToWho";
import { finishLabel } from "./finishLabel";
import { SetupInviteSection } from "./SetupInviteSection";
import { useSetupInvites } from "./useSetupInvites";

type Props = {
  /** What the owner chose on "Who uses Broccoli". */
  search: SetupInviteSearch;
};

/**
 * The last step of self-hosted setup: the browser holding it creates the owner account, around
 * the people its import adds and the invites the owner chose, which go out with the account.
 */
export function OwnerStep({ search }: Props) {
  // An import employee's key is its work email, unless it has none.
  const workEmail = search.me?.includes("@") ? search.me : "";
  // As typed once the field is left, so the preview leaves out whoever has that work email.
  const [accountEmail, setAccountEmail] = useState(workEmail);
  const invites = useSetupInvites(search, accountEmail.trim() || null);
  const [noteHasLink, setNoteHasLink] = useState(false);

  return (
    <SetupLayout step="owner" title={t("setup.owner.heading")} width="narrow">
      <OwnerSetupForm
        intro={<ApprovedPeopleSummary />}
        secondaryAction={<BackToWho search={search} />}
        width="narrow"
        defaultEmail={workEmail}
        onEmailEntered={setAccountEmail}
        choices={invites.choices}
        canSubmit={invites.loaded}
        onCreated={invites.finish}
        onNoteRefused={(codes) => setNoteHasLink(codes.includes("has_link"))}
        submitLabel={finishLabel(invites, "setup.owner.submit", "setup.owner.submitAnd")}
      >
        <SetupInviteSection invites={invites} noteHasLink={noteHasLink} />
      </OwnerSetupForm>
      {invites.linksDialog}
    </SetupLayout>
  );
}
