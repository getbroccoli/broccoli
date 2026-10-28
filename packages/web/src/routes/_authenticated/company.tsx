import { createFileRoute } from "@tanstack/react-router";

import { t } from "@/i18n";
import { NotFoundPage, PageHeader } from "@/shell";

export const Route = createFileRoute("/_authenticated/company")({
  component: function CompanyPage() {
    const { me } = Route.useRouteContext();
    // The server refuses the company to anyone else; the page is not theirs to find.
    if (!me.operations.includes("MANAGE_WORKSPACE")) return <NotFoundPage />;
    return <PageHeader title={t("company.title")} description={t("company.empty")} />;
  },
});
