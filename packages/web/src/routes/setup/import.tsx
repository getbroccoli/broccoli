import { createFileRoute } from "@tanstack/react-router";

import { ImportStep, importSearch } from "@/features/imports";
import { requireSetupStep, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** The owner brings in their people; outside the app shell until setup is done. */
export const Route = createFileRoute("/setup/import")({
  validateSearch: importSearch,
  beforeLoad: (gate) => {
    requireSetupStep("IMPORT", gate);
  },
  component: () => (
    <SetupLayout
      step="import"
      title={t("setup.import.title")}
      description={t("setup.import.description")}
    >
      <ImportStep />
    </SetupLayout>
  ),
});
