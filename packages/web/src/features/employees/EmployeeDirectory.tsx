import { useQuery } from "@apollo/client/react";
import { LockSimple, UserCircle, WarningCircle } from "@phosphor-icons/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { EmployeesDocument } from "@/__generated__/graphql";
import { applicationErrorOf } from "@/apollo";
import { DataTable, TableState, type DataTableSort } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { toEmployeesVariables, type SortKey } from "./directory-search";
import { EMPLOYEE_COLUMNS } from "./employee-columns";
import { EmployeeSearchField } from "./EmployeeSearchField";
import { NoMatchingEmployees } from "./NoMatchingEmployees";

const SIGNED_OUT_CODES = new Set(["UNAUTHENTICATED", "FORBIDDEN"]);

/** The People directory: employees one page at a time, with sort, search and paging in the URL. */
export function EmployeeDirectory() {
  const search = useSearch({ from: "/people" });
  const navigate = useNavigate({ from: "/people" });
  const { data, previousData, error, loading, refetch } = useQuery(EmployeesDocument, {
    variables: toEmployeesVariables(search),
  });
  const applicationError = applicationErrorOf(error);
  const hasInvalidCursor = applicationError?.fieldErrors.some(({ field }) => field === "after");

  useEffect(() => {
    if (hasInvalidCursor) {
      void navigate({ search: (prev) => ({ ...prev, after: undefined }), replace: true });
    }
  }, [hasInvalidCursor, navigate]);

  const changeQuery = useCallback(
    (q: string | undefined) =>
      void navigate({ search: (prev) => ({ ...prev, q, after: undefined }), replace: true }),
    [navigate],
  );
  const changeSort = ({ key, direction }: DataTableSort<SortKey>) =>
    void navigate({ search: (prev) => ({ ...prev, sort: key, dir: direction, after: undefined }) });

  const connection = (data ?? previousData)?.employees;

  return (
    <DataTable
      columns={EMPLOYEE_COLUMNS}
      rows={connection?.edges.map(({ node }) => node)}
      getRowId={(employee) => employee.id}
      sort={{ key: search.sort, direction: search.dir }}
      onSortChange={changeSort}
      isLoading={loading}
      toolbar={<EmployeeSearchField query={search.q} onQueryChange={changeQuery} />}
      notice={error && !hasInvalidCursor ? errorNotice() : undefined}
      emptyState={
        search.q ? (
          <NoMatchingEmployees query={search.q} onClear={() => changeQuery(undefined)} />
        ) : (
          <TableState
            icon={UserCircle}
            title={t("people.empty.title")}
            detail={t("people.empty.detail")}
          />
        )
      }
      pager={
        connection && {
          hasNextPage: connection.pageInfo.hasNextPage,
          isFirstPage: !search.after,
          // Rows kept from the previous search or sort cannot continue the current one.
          onNext: data
            ? () =>
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    after: data.employees.pageInfo.endCursor ?? undefined,
                  }),
                })
            : undefined,
          onFirst: () => void navigate({ search: (prev) => ({ ...prev, after: undefined }) }),
        }
      }
    />
  );

  function errorNotice() {
    if (applicationError && SIGNED_OUT_CODES.has(applicationError.code)) {
      return <TableState icon={LockSimple} title={t("people.signedOut.title")} />;
    }
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
