import { createFileRoute, redirect } from "@tanstack/react-router";

import { ImportStep, importSearch } from "@/features/imports";
import { SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** The owner brings in their people; outside the app shell until setup is done. */
export const Route = createFileRoute("/setup/import")({
  validateSearch: importSearch,
  beforeLoad: ({ context: { me, setupStep }, location }) => {
    if (!me) {
      throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    }
    if (setupStep === "DONE") {
      throw redirect({ to: "/people", replace: true });
    }
    if (setupStep === "COMPANY") {
      throw redirect({ to: "/setup/company", replace: true });
    }
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
