import { useQuery } from "@apollo/client/react";
import { ArrowRight } from "@phosphor-icons/react";

import { CompleteSetupDocument, ReadyStepDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { SetupLayout, SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";
import { useRouteAction } from "@/lib/useRouteAction";

import { ApprovedPeopleSummary } from "./ApprovedPeopleSummary";
import { BackToReview } from "./BackToReview";

/**
 * The last step of managed setup: the people it added and where they came from. Start
 * adds the approved people and completes setup, which routing follows into the app; Back
 * reopens the review.
 */
export function ReadyStep() {
  const { data } = useQuery(ReadyStepDocument, { fetchPolicy: "network-only" });
  const [completeSetup, { error, payloadError }] = usePayloadMutation(CompleteSetupDocument);
  const [run, starting] = useRouteAction();
  const company = data?.company.name;

  // `error` or `payloadError`, such as another tab having gone back to the review, shows a failure.
  const start = () => run(() => completeSetup());

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
            <BackToReview />
            <Button type="submit" size="lg" className="ml-auto h-10 gap-2 px-4" disabled={starting}>
              {t(starting ? "setup.ready.starting" : "setup.ready.start")}
              <ArrowRight weight="bold" aria-hidden />
            </Button>
          </div>
        }
      >
        <ApprovedPeopleSummary />
        {(error || payloadError) && (
          <p role="alert" className="text-center text-sm text-destructive">
            {t("setup.ready.failed")}
          </p>
        )}
      </SetupStepForm>
    </SetupLayout>
  );
}
