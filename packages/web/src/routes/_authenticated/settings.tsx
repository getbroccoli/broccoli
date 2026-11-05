import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { t } from "@/i18n";
import { PageHeader } from "@/shell";

/** The instance settings, for admins, one section per page. */
export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: ({ context: { me } }) => {
    if (!me.operations.includes("MANAGE_WORKSPACE")) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: () => (
    <>
      <PageHeader title={t("settings.title")} />
      <Outlet />
    </>
  ),
});
