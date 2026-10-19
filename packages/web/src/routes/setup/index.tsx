import { createFileRoute } from "@tanstack/react-router";

import { OwnerSetupForm, requireSetupStep, SetupLayout, setUpOwner } from "@/features/setup";
import { t } from "@/i18n";

/** The last step of self-hosted setup: the browser holding it creates the owner account. */
export const Route = createFileRoute("/setup/")({
  beforeLoad: (gate) => {
    requireSetupStep("OWNER", gate);
  },
  component: () => (
    <SetupLayout
      step="owner"
      title={t("setup.owner.title")}
      description={t("setup.owner.description")}
    >
      <OwnerSetupForm createAccount={setUpOwner} />
    </SetupLayout>
  ),
});
