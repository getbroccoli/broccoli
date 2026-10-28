import { createFileRoute } from "@tanstack/react-router";

import { ApprovedPeopleSummary, BackToReview } from "@/features/imports";
import { OwnerSetupForm, requireSetupPage, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/**
 * The last step of self-hosted setup: the browser holding it creates the owner account,
 * around the people its import added.
 */
export const Route = createFileRoute("/setup/")({
  beforeLoad: (gate) => {
    requireSetupPage("owner", gate);
  },
  component: () => (
    <SetupLayout step="owner" title={t("setup.owner.heading")} width="narrow">
      <OwnerSetupForm
        intro={<ApprovedPeopleSummary />}
        secondaryAction={<BackToReview />}
        width="narrow"
      />
    </SetupLayout>
  ),
});
