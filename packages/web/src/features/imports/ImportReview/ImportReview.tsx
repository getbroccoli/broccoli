import { useQuery } from "@apollo/client/react";
import { ArrowLeft, MagnifyingGlass, UserCircle, WarningCircle } from "@phosphor-icons/react";
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import { ApproveImportDocument, ImportReviewDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import {
  DataTable,
  type DataTablePager,
  TableSearchField,
  TableState,
} from "@/components/dataTable";
import { Button, buttonVariants } from "@/components/ui/button";
import { type EmployeeListSearch, toEmployeeListVariables } from "@/features/employees";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { SEARCH_MAX_LENGTH, useListPage } from "@/lib/listPage";

import { IMPORT_REVIEW_COLUMNS, useImportReviewRows } from "./importReviewColumns";
import { ApproveNote } from "./ApproveNote";
import { SourceChips } from "./SourceChips";

/**
 * The setup review step: everyone the import found, read-only, and Approve. Approve
 * adds the ready people; the router then reloads and routing sends the owner on.
 */
export function ImportReview() {
  const router = useRouter();
  const search = useSearch({ from: "/setup/import_/review" });
  const navigate = useNavigate({ from: "/setup/import/review" });
  const writeSearch = useCallback(
    (patch: Partial<EmployeeListSearch>, replace: boolean) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace }),
    [navigate],
  );
  const { data, previousData, error, loading, refetch } = useQuery(
    ImportReviewDocument,
    // Sources change on the import page: show the cache, then refresh it on entry.
    { variables: toEmployeeListVariables(search), fetchPolicy: "cache-and-network" },
  );
  const list = useListPage({
    search,
    writeSearch,
    current: data?.import.employees,
    previous: previousData?.import.employees,
    error,
  });
  const rows = useImportReviewRows(list.rows);
  const sources = (data ?? previousData)?.import.sources ?? [];
  const reading = sources.some(({ status }) => status === "MAPPING");
  const [
    approveImport,
    { loading: approving, error: approveError, payloadError: approveConflict },
  ] = usePayloadMutation(ApproveImportDocument);
  const readyCount = (data ?? previousData)?.import.readyEmployeeCount ?? 0;
  const peopleSources = sources.filter(({ employeeCount }) => employeeCount > 0);
  const totalCount = sources.reduce((total, { employeeCount }) => total + employeeCount, 0);
  const leftOutCount = totalCount - readyCount;

  const approve = async () => {
    try {
      await approveImport();
    } catch {
      return; // `approveError` or `approveConflict` shows it
    }
    await router.invalidate();
  };

  return (
    <SetupStepForm
      width="wide"
      // Enter in the search must not approve: only the Approve button does.
      onSubmit={() => {}}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <Link
            to="/setup/import"
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-10 gap-2 px-3")}
            disabled={approving}
          >
            <ArrowLeft aria-hidden />
            {t("setup.review.back")}
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {data && <ApproveNote readyCount={readyCount} leftOutCount={leftOutCount} />}
            {readyCount > 0 && (
              <Button
                type="button"
                size="lg"
                className="h-10 px-4"
                // Only what the owner sees now: not while the review refreshes or failed to.
                disabled={approving || reading || loading || Boolean(error)}
                onClick={() => void approve()}
              >
                {approveLabel({ approving, reading, readyCount })}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {peopleSources.length > 0 && <SourceChips sources={peopleSources} />}
        <TableSearchField
          query={search.q}
          onQueryChange={list.changeQuery}
          label={t("setup.review.search.label")}
          placeholder={t("setup.review.search.placeholder")}
          maxLength={SEARCH_MAX_LENGTH}
        />
      </div>
      <DataTable
        columns={IMPORT_REVIEW_COLUMNS}
        rows={rows}
        getRowId={(person) => person.id}
        sort={list.sort}
        onSortChange={list.changeSort}
        isLoading={loading}
        notice={list.error ? errorNotice() : undefined}
        emptyState={search.q ? noMatches(search.q) : noPeople()}
        pager={list.pager}
        density="comfortable"
        summary={peopleCount(totalCount, search.q ? list.rows : undefined, list.pager)}
      />
      {(approveError || approveConflict) && (
        <p role="alert" className="text-sm text-destructive">
          {t("setup.review.approveFailed")}
        </p>
      )}
    </SetupStepForm>
  );

  function noMatches(query: string) {
    return (
      <TableState
        icon={MagnifyingGlass}
        title={t("setup.review.noMatches", { query })}
        action={
          <Button variant="outline" size="sm" onClick={() => list.changeQuery(undefined)}>
            {t("setup.review.clearSearch")}
          </Button>
        }
      />
    );
  }

  function noPeople() {
    return <TableState icon={UserCircle} title={t("setup.review.empty")} />;
  }

  function errorNotice() {
    return (
      <TableState
        isError
        icon={WarningCircle}
        title={t("imports.loadFailed")}
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("imports.retry")}
          </Button>
        }
      />
    );
  }
}

function approveLabel({
  approving,
  reading,
  readyCount,
}: {
  approving: boolean;
  reading: boolean;
  readyCount: number;
}) {
  if (approving) {
    return t("setup.review.approving");
  }
  if (reading) {
    return t("setup.review.reading");
  }
  return readyCount === 1
    ? t("setup.review.approveOne")
    : t("setup.review.approve", { count: String(readyCount) });
}

/** "60 people", or "Showing 6 of 60 people" for a search whose matches fit on one page. */
function peopleCount(
  total: number,
  matches: unknown[] | undefined,
  pager: DataTablePager | undefined,
): string {
  const people =
    total === 1 ? t("setup.review.countOne") : t("setup.review.count", { count: String(total) });
  if (!matches || pager?.hasNextPage || pager?.isFirstPage === false) {
    return people;
  }
  return t("setup.review.showing", { count: String(matches.length), people });
}
