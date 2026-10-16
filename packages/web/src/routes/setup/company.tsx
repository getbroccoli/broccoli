import { createFileRoute } from "@tanstack/react-router";

import { CompanyStepForm, requireSetupStep, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** The owner names the company; outside the app shell until setup is done. */
export const Route = createFileRoute("/setup/company")({
  beforeLoad: (gate) => {
    requireSetupStep("COMPANY", gate);
  },
  component: () => (
    <SetupLayout
      step="company"
      title={t("setup.company.title")}
      description={t("setup.company.description")}
    >
      <CompanyStepForm />
    </SetupLayout>
  ),
});
