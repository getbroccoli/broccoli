import { createFileRoute, redirect } from "@tanstack/react-router";

import { AiStep } from "@/features/ai";
import { requireSetupStep, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** A self-hosted owner picks how Broccoli reads their files; managed instances keep their key. */
export const Route = createFileRoute("/setup/ai")({
  beforeLoad: (gate) => {
    requireSetupStep("IMPORT", gate);
    if (gate.context.mode === "MANAGED") {
      throw redirect({ to: "/setup/import", replace: true });
    }
  },
  component: () => (
    <SetupLayout step="ai" title={t("setup.ai.title")} description={t("setup.ai.description")}>
      <AiStep />
    </SetupLayout>
  ),
});
