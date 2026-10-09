import { createFileRoute } from "@tanstack/react-router";

import { t } from "@/i18n";
import { PageHeader } from "@/shell";

export const Route = createFileRoute("/people")({
  component: () => <PageHeader title={t("people.title")} description={t("people.empty")} />,
});
