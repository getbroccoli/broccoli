import { createFileRoute } from "@tanstack/react-router";

import { t } from "@/i18n";
import { PageHeader } from "@/shell";

export const Route = createFileRoute("/_authenticated/company")({
  component: () => <PageHeader title={t("company.title")} description={t("company.empty")} />,
});
