import { createFileRoute, redirect } from "@tanstack/react-router";

import { EmailSettings } from "@/features/settings";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

/** The instance settings, for admins. */
export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: ({ context: { me } }) => {
    if (!me.operations.includes("MANAGE_WORKSPACE")) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: () => (
    <>
      <PageHeader title={t("settings.title")} />
      <EmailSettings />
    </>
  ),
});
