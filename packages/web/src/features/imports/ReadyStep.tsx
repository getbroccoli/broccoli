import { useQuery } from "@apollo/client/react";
import { ArrowRight } from "@phosphor-icons/react";

import { CompleteSetupDocument, ReadyStepDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { type SetupInviteSearch, SetupLayout, SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";
import { useRouteAction } from "@/lib/useRouteAction";

import { ApprovedPeopleSummary } from "./ApprovedPeopleSummary";
import { BackToWho } from "./SetupInvites/BackToWho";
import { finishLabel } from "./SetupInvites/finishLabel";
import { SetupInviteSection } from "./SetupInvites/SetupInviteSection";
import { useSetupInvites } from "./SetupInvites/useSetupInvites";

type Props = {
  /** What the owner chose on "Who uses Broccoli". */
  search: SetupInviteSearch;
};

/**
 * The last step of managed setup: the people it adds, and the invites the owner chose. Start
 * adds the people, links the owner, sends the invites and completes setup, which routing follows
 * into the app once any links are copied; Back returns to "Who uses Broccoli".
 */
export function ReadyStep({ search }: Props) {
  const { data } = useQuery(ReadyStepDocument, { fetchPolicy: "network-only" });
  const [completeSetup, { error, payloadError }] = usePayloadMutation(CompleteSetupDocument);
  const [run, starting] = useRouteAction();
  const invites = useSetupInvites(search);
  const company = data?.company.name;
  const noteHasLink =
    payloadError?.__typename === "InvalidInputError" &&
    payloadError.fields.some(({ field, code }) => field === "note" && code === "has_link");

  // `error` or `payloadError`, such as another tab having gone back to the review, shows a failure.
  const start = () =>
    run(async () => {
      const { invites: sent } = await completeSetup({ variables: { input: invites.choices } });
      await invites.finish(sent ?? []);
    });

  return (
    <SetupLayout
      step="ready"
      title={company ? t("setup.ready.heading", { company }) : t("setup.ready.title")}
      description={t("setup.ready.description")}
      width="narrow"
    >
      <SetupStepForm
        width="narrow"
        onSubmit={start}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <BackToWho search={search} disabled={starting} />
            <Button
              type="submit"
              size="lg"
              className="ml-auto h-10 gap-2 px-4"
              disabled={starting || !invites.loaded}
            >
              {starting
                ? t("setup.ready.starting")
                : finishLabel(invites, "setup.ready.start", "setup.ready.startAnd")}
              <ArrowRight weight="bold" aria-hidden />
            </Button>
          </div>
        }
      >
        <ApprovedPeopleSummary showEmpty />
        <SetupInviteSection invites={invites} noteHasLink={noteHasLink} />
        {(error || payloadError) && !noteHasLink && (
          <p role="alert" className="text-center text-sm text-destructive">
            {t("setup.ready.failed")}
          </p>
        )}
      </SetupStepForm>
      {invites.linksDialog}
    </SetupLayout>
  );
}
