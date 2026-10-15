import { useQuery } from "@apollo/client/react";
import { UserCircle, WarningCircle } from "@phosphor-icons/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import { EmployeesDocument } from "@/__generated__/graphql";
import { DataTable, TableSearchField, TableState } from "@/components/dataTable";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { SEARCH_MAX_LENGTH, useListPage } from "@/lib/listPage";

import { toEmployeesVariables, type DirectorySearch } from "./directorySearch";
import { EMPLOYEE_COLUMNS, useEmployeeRows } from "./employeeColumns";
import { NoMatchingEmployees } from "./NoMatchingEmployees";

/** The People directory: employees one page at a time, with sort, search and paging in the URL. */
export function EmployeeDirectory() {
  const search = useSearch({ from: "/_authenticated/people" });
  const navigate = useNavigate({ from: "/people" });
  const writeSearch = useCallback(
    (patch: Partial<DirectorySearch>, replace: boolean) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace }),
    [navigate],
  );
  const { data, previousData, error, loading, refetch } = useQuery(EmployeesDocument, {
    variables: toEmployeesVariables(search),
  });
  const list = useListPage({
    search,
    writeSearch,
    current: data?.employees,
    previous: previousData?.employees,
    error,
  });
  const rows = useEmployeeRows(list.rows);

  return (
    <DataTable
      columns={EMPLOYEE_COLUMNS}
      rows={rows}
      getRowId={(employee) => employee.id}
      sort={list.sort}
      onSortChange={list.changeSort}
      isLoading={loading}
      toolbar={
        <TableSearchField
          query={search.q}
          onQueryChange={list.changeQuery}
          label={t("people.search.label")}
          placeholder={t("people.search.placeholder")}
          maxLength={SEARCH_MAX_LENGTH}
        />
      }
      notice={list.error ? errorNotice() : undefined}
      emptyState={
        search.q ? (
          <NoMatchingEmployees query={search.q} onClear={() => list.changeQuery(undefined)} />
        ) : (
          <TableState
            icon={UserCircle}
            title={t("people.empty.title")}
            detail={t("people.empty.detail")}
          />
        )
      }
      pager={list.pager}
    />
  );

  function errorNotice() {
    return (
      <TableState
        isError
        icon={WarningCircle}
        title={t("people.error.title")}
        detail={t("people.error.detail")}
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("people.error.retry")}
          </Button>
        }
      />
    );
  }
}
