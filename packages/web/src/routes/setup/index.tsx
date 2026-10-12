import { createFileRoute, redirect } from "@tanstack/react-router";

import { OwnerSetupForm, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** Creates the owner of a new instance; once one exists, sign-in takes over. */
export const Route = createFileRoute("/setup/")({
  beforeLoad: ({ context: { setupStep, signIn } }) => {
    // Managed instances get their owner from the accounts service, never from this page.
    if (setupStep !== "OWNER" || signIn === "MANAGED") {
      throw redirect({ to: "/login", search: { redirect: "/" }, replace: true });
    }
  },
  component: () => (
    <SetupLayout
      step="owner"
      title={t("setup.owner.title")}
      description={t("setup.owner.description")}
    >
      <OwnerSetupForm />
    </SetupLayout>
  ),
});
