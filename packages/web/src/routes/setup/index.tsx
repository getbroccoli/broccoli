import { createFileRoute } from "@tanstack/react-router";

import { AddedPeopleRing, ResetSetupDialog } from "@/features/imports";
import { OwnerSetupForm, requireSetupStep, SetupLayout, setUpOwner } from "@/features/setup";
import { t } from "@/i18n";

/**
 * The last step of self-hosted setup: the browser holding it creates the owner account,
 * around the people its import added.
 */
export const Route = createFileRoute("/setup/")({
  beforeLoad: (gate) => {
    requireSetupStep("OWNER", gate);
  },
  component: () => (
    <SetupLayout step="owner" title={t("setup.owner.heading")} width="narrow">
      <OwnerSetupForm
        createAccount={setUpOwner}
        intro={<AddedPeopleRing />}
        secondaryAction={<ResetSetupDialog />}
        width="narrow"
      />
    </SetupLayout>
  ),
});
