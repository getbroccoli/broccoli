import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";

import { DEFAULT_SETTINGS_SEARCH, settingsSearch, SettingsTabs } from "@/features/settings";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

/** The instance settings, for admins. */
export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: settingsSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_SETTINGS_SEARCH)] },
  beforeLoad: ({ context: { me } }) => {
    if (!me.operations.includes("MANAGE_WORKSPACE")) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: () => (
    <>
      <PageHeader title={t("settings.title")} />
      <SettingsTabs />
    </>
  ),
});
