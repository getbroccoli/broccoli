import { createFileRoute } from "@tanstack/react-router";

import { PingStatus } from "@/features/system";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

export const Route = createFileRoute("/people")({
  component: () => (
    <>
      <PageHeader title={t("people.title")} description={t("people.empty")} />
      {/* Temporary debug check of the API connection; remove once this page lists people. */}
      <PingStatus />
    </>
  ),
});
