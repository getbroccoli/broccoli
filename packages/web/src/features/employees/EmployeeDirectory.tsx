import { useQuery } from "@apollo/client/react";
import { UserCircle, WarningCircle } from "@phosphor-icons/react";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { EmployeesDocument } from "@/__generated__/graphql";
import { BulkBar, DataTable, TableSearchField, TableState } from "@/components/dataTable";
import { Button } from "@/components/ui/button";
import { InviteDialog } from "@/features/invites";
import { t } from "@/i18n";
import { SEARCH_MAX_LENGTH, useListPage } from "@/lib/listPage";

import { toEmployeeListVariables, type EmployeeListSearch } from "./employeeListSearch";
import {
  EMPLOYEE_COLUMNS,
  SIGN_IN_COLUMN,
  useCachedEmployeeRows,
  useEmployeeRows,
} from "./employeeColumns";
import { NoMatchingEmployees } from "./NoMatchingEmployees";

/**
 * The People directory: employees one page at a time, with sort, search and paging in the URL.
 * Admins also see who can sign in, and select people to invite.
 */
export function EmployeeDirectory() {
  const { me, demoExpiresAt } = useRouteContext({ from: "/_authenticated" });
  // Nobody signs in as the sample company's people.
  const canInvite = me.operations.includes("MANAGE_WORKSPACE") && !demoExpiresAt;
  // Kept across pages, so a selection can span them.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  // As the cache holds them now, so a status changed elsewhere shows and a removed person drops out.
  const selected = useCachedEmployeeRows(selectedIds);
  const [inviting, setInviting] = useState(false);
  const search = useSearch({ from: "/_authenticated/people" });
  const navigate = useNavigate({ from: "/people" });
  const writeSearch = useCallback(
    (patch: Partial<EmployeeListSearch>, replace: boolean) =>
      void navigate({
        // A pending search may finish after a person's panel opens.
        unsafeRelative: "path",
        search: (prev) => ({ ...prev, ...patch }),
        replace,
      }),
    [navigate],
  );
  // Opening People shows the cached page at once and the server's current one when it is back.
  const { data, previousData, error, loading, refetch } = useQuery(EmployeesDocument, {
    variables: toEmployeeListVariables(search),
    fetchPolicy: "cache-and-network",
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
    <>
      <DataTable
        columns={canInvite ? [...EMPLOYEE_COLUMNS, SIGN_IN_COLUMN] : EMPLOYEE_COLUMNS}
        selection={
          canInvite
            ? {
                // The people still there, so removing the last one ends the selection.
                selectedIds: new Set(selected.map(({ id }) => id)),
                onChange: setSelectedIds,
                rowLabel: ({ firstName, lastName }) => `${firstName} ${lastName}`,
              }
            : undefined
        }
        bulkBar={
          <BulkBar
            count={selected.length}
            actions={
              <Button size="sm" onClick={() => setInviting(true)}>
                {t("invites.bulk.invite")}
              </Button>
            }
            onClear={() => setSelectedIds(new Set())}
          />
        }
        rows={rows}
        getRowId={(employee) => employee.id}
        onRowClick={(employee) =>
          void navigate({
            to: "/people/$employeeId",
            params: { employeeId: employee.id },
            search: (previous) => previous,
          })
        }
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
      <InviteDialog
        people={selected}
        open={inviting}
        onOpenChange={setInviting}
        onInvited={() => setSelectedIds(new Set())}
      />
    </>
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
