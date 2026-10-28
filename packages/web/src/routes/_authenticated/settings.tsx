import { createFileRoute, redirect } from "@tanstack/react-router";

import { EmailSettings } from "@/features/settings";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

/** The owner's settings of the instance. */
export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: ({ context: { me } }) => {
    if (!me.isOwner) {
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
