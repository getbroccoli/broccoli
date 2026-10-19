import { createFileRoute, redirect } from "@tanstack/react-router";

import { createDemoAccount, OwnerSetupForm, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** Where the demo's owner gives themselves an email and password before the demo ends. */
export const Route = createFileRoute("/account")({
  beforeLoad: ({ context }) => {
    if (!context.me || !context.demoExpiresAt) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: () => (
    <SetupLayout
      step="owner"
      title={t("setup.owner.title")}
      description={t("demo.account.description")}
    >
      <OwnerSetupForm createAccount={createDemoAccount} />
    </SetupLayout>
  ),
});
