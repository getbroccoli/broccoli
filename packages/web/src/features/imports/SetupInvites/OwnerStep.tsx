import { useQuery } from "@apollo/client/react";
import { useState } from "react";

import { SetupOwnerPersonDocument } from "@/__generated__/graphql";
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
  // The chosen person's work email as the review has it now, not as the import first read it.
  const chosen = useQuery(SetupOwnerPersonDocument, {
    variables: { me: search.me ?? "" },
    skip: !search.me,
  });
  const workEmail = chosen.data?.import.chosen?.email.value ?? "";
  // As typed once the field is left, so the preview leaves out whoever has that work email.
  const [enteredEmail, setEnteredEmail] = useState<string | null>(null);
  const invites = useSetupInvites(search, (enteredEmail ?? workEmail).trim() || null);
  const [noteHasLink, setNoteHasLink] = useState(false);
  // The form reads its email once, so it waits for the work email.
  const ready = !search.me || chosen.data !== undefined || chosen.error !== undefined;

  return (
    <SetupLayout step="owner" title={t("setup.owner.heading")} width="narrow">
      {ready && (
        <OwnerSetupForm
          intro={<ApprovedPeopleSummary />}
          secondaryAction={<BackToWho search={search} />}
          width="narrow"
          defaultEmail={workEmail}
          onEmailEntered={setEnteredEmail}
          choices={invites.choices}
          canSubmit={invites.loaded}
          onCreated={invites.finish}
          onNoteRefused={(codes) => setNoteHasLink(codes.includes("has_link"))}
          submitLabel={finishLabel(invites, "setup.owner.submit", "setup.owner.submitAnd")}
        >
          <SetupInviteSection invites={invites} noteHasLink={noteHasLink} />
        </OwnerSetupForm>
      )}
      {invites.linksDialog}
    </SetupLayout>
  );
}
