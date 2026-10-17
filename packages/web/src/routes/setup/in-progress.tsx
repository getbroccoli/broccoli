import { createFileRoute } from "@tanstack/react-router";

import { SetupInProgress } from "@/features/setup";
import { t } from "@/i18n";
import { AuthCard } from "@/shell";

/** What every browser but the one holding setup sees until the owner exists; the root routes here. */
export const Route = createFileRoute("/setup/in-progress")({
  component: () => (
    <AuthCard title={t("setup.inProgress.title")} description={t("setup.inProgress.description")}>
      <SetupInProgress />
    </AuthCard>
  ),
});
