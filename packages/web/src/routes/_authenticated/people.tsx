import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { DEFAULT_DIRECTORY_SEARCH, directorySearch, EmployeeDirectory } from "@/features/employees";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

export const Route = createFileRoute("/_authenticated/people")({
  validateSearch: directorySearch,
  search: { middlewares: [stripSearchParams(DEFAULT_DIRECTORY_SEARCH)] },
  component: () => (
    <>
      <PageHeader title={t("people.title")} />
      <EmployeeDirectory />
    </>
  ),
});
