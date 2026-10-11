import { createFileRoute, redirect } from "@tanstack/react-router";

import { SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** The owner names the company; outside the app shell until setup is done. */
export const Route = createFileRoute("/setup/company")({
  beforeLoad: ({ context: { me, setupStep }, location }) => {
    if (!me) {
      throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    }
    if (setupStep === "DONE") {
      throw redirect({ to: "/people", replace: true });
    }
  },
  component: () => (
    <SetupLayout
      step="company"
      title={t("setup.company.title")}
      description={t("setup.company.description")}
    />
  ),
});
