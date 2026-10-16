import { createFileRoute, redirect } from "@tanstack/react-router";

import { SetupInProgress } from "@/features/setup";
import { AuthCard } from "@/shell";
import { t } from "@/i18n";

/** What every browser but the one holding setup sees until the owner exists. */
export const Route = createFileRoute("/setup/in-progress")({
  beforeLoad: ({ context: { holdsSetup, me } }) => {
    if (holdsSetup || me) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: () => (
    <AuthCard title={t("setup.inProgress.title")} description={t("setup.inProgress.description")}>
      <SetupInProgress />
    </AuthCard>
  ),
});
