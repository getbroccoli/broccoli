import { ArrowLeft } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";

import { ReopenReviewDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useRouteAction } from "@/lib/useRouteAction";

/**
 * "Back" on setup's last step: reopens the review, where the owner can change who is added
 * and approve again. Nobody is added before setup completes, so nothing is lost.
 */
export function BackToReview() {
  const [reopenReview, { error }] = usePayloadMutation(ReopenReviewDocument);
  const [run, reopening] = useRouteAction();
  const navigate = useNavigate();

  // `error` shows a failure. The step moves first, so the review's gate lets the owner in.
  const back = () =>
    run(
      () => reopenReview(),
      () => navigate({ to: "/setup/import/review" }),
    );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="ghost"
        size="lg"
        className="h-10 gap-2 px-3"
        disabled={reopening}
        onClick={back}
      >
        <ArrowLeft aria-hidden />
        {t("setup.back")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("setup.reopenFailed")}
        </p>
      )}
    </div>
  );
}
