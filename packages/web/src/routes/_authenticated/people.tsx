import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import {
  DEFAULT_EMPLOYEE_LIST_SEARCH,
  employeeListSearch,
  EmployeeDirectory,
} from "@/features/employees";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

export const Route = createFileRoute("/_authenticated/people")({
  validateSearch: employeeListSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_EMPLOYEE_LIST_SEARCH)] },
  component: () => (
    <>
      <PageHeader title={t("people.title")} />
      <EmployeeDirectory />
    </>
  ),
});
